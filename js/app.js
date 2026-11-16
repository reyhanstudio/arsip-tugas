let currentUser = null;
let currentProfile = null;
let activeTaskForDownload = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Cek sesi login aktif
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = session.user;

  // 2. Ambil profil user & role dari Supabase
  const { data: profile, error: profError } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (profError || !profile) {
    alert('Profil user tidak ditemukan di database!');
    await supabaseClient.auth.signOut();
    window.location.href = 'index.html';
    return;
  }

  currentProfile = profile;
  document.getElementById('user-display-name').textContent = profile.nama_lengkap;
  
  const roleBadge = document.getElementById('user-role-badge');
  if (profile.role === 'admin') {
    roleBadge.textContent = 'ADMIN';
    roleBadge.className = 'badge bg-warning text-dark';
    document.getElementById('admin-menu-section').classList.remove('d-none');
  } else {
    roleBadge.textContent = 'USER';
    roleBadge.className = 'badge bg-primary';
    // Sembunyikan shortcut upload untuk user biasa
    document.getElementById('card-upload-shortcut').style.display = 'none';
  }

  // 3. Muat data awal
  loadDashboardStats();
  loadTasks();
  loadCategories();
  loadChatMessages();
  setupRealtimeChat();
});

// --- NAVIGASI TAB ---
function switchTab(tabName, event) {
  if (event) event.preventDefault();
  
  document.querySelectorAll('.content-tab').forEach(el => el.classList.add('d-none'));
  document.querySelectorAll('.sidebar .nav-link').forEach(el => el.classList.remove('active'));

  document.getElementById(`tab-${tabName}`).classList.remove('d-none');
  if (event && event.currentTarget) {
    event.currentTarget.classList.add('active');
  }

  const titles = {
    'dashboard': 'Dashboard',
    'tasks': 'Daftar Semua Tugas',
    'categories': 'Kelola Kategori',
    'chat': 'Grup Diskusi Universal',
    'upload': 'Tambah Tugas Baru',
    'users': 'Manajemen Akun User',
    'logs': 'Riwayat Aktivitas'
  };
  document.getElementById('page-title').textContent = titles[tabName] || 'Dashboard';

  if (tabName === 'users' && currentProfile.role === 'admin') loadUsers();
  if (tabName === 'logs' && currentProfile.role === 'admin') loadLogs();
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'index.html';
}

// --- STATISTIK & TUGAS ---
async function loadDashboardStats() {
  const { count: taskCount } = await supabaseClient.from('tasks').select('*', { count: 'exact', head: true });
  const { count: catCount } = await supabaseClient.from('categories').select('*', { count: 'exact', head: true });

  document.getElementById('stat-total-tasks').textContent = taskCount || 0;
  document.getElementById('stat-total-categories').textContent = catCount || 0;

  // Muat tugas terbaru ke tabel dashboard
  const { data: tasks } = await supabaseClient
    .from('tasks')
    .select('id, judul, template_type, created_at, categories(nama_kategori)')
    .order('created_at', { ascending: false })
    .limit(5);

  const tbody = document.getElementById('task-table-body');
  if (!tasks || tasks.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Belum ada tugas.</td></tr>`;
    return;
  }

  tbody.innerHTML = tasks.map((t, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td class="fw-semibold">${t.judul}</td>
      <td><span class="badge bg-secondary">${t.categories?.nama_kategori || 'Tanpa Kategori'}</span></td>
      <td><span class="badge bg-info text-dark">${t.template_type}</span></td>
      <td>${new Date(t.created_at).toLocaleDateString('id-ID')}</td>
      <td><button class="btn btn-sm btn-primary" onclick="openTaskDetail(${t.id})"><i class="bi bi-eye"></i> Detail</button></td>
    </tr>
  `).join('');
}

async function loadTasks() {
  const catFilter = document.getElementById('filter-category').value;
  let query = supabaseClient.from('tasks').select('id, judul, template_type, categories(nama_kategori)').order('created_at', { ascending: false });
  
  if (catFilter) query = query.eq('kategori_id', catFilter);

  const { data: tasks } = await query;
  const tbody = document.getElementById('all-task-table-body');

  if (!tasks || tasks.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Tidak ada tugas ditemukan.</td></tr>`;
    return;
  }

  tbody.innerHTML = tasks.map((t, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td class="fw-semibold">${t.judul}</td>
      <td><span class="badge bg-secondary">${t.categories?.nama_kategori || 'Tanpa Kategori'}</span></td>
      <td><span class="badge bg-info text-dark">Template: ${t.template_type}</span></td>
      <td><button class="btn btn-sm btn-success" onclick="openTaskDetail(${t.id})"><i class="bi bi-download"></i> Buka & Download</button></td>
    </tr>
  `).join('');
}

// --- KATEGORI ---
async function loadCategories() {
  const { data: cats } = await supabaseClient.from('categories').select('*').order('nama_kategori', { ascending: true });
  
  // Select di form upload & filter
  const selectUpload = document.getElementById('task-category');
  const selectFilter = document.getElementById('filter-category');
  const listCat = document.getElementById('category-list');

  if (cats) {
    selectUpload.innerHTML = cats.map(c => `<option value="${c.id}">${c.nama_kategori}</option>`).join('');
    selectFilter.innerHTML = `<option value="">Semua Kategori</option>` + cats.map(c => `<option value="${c.id}">${c.nama_kategori}</option>`).join('');
    
    listCat.innerHTML = cats.map(c => `<li class="list-group-item d-flex justify-content-between align-items-center">${c.nama_kategori}</li>`).join('');
  }
}

async function addCategory(e) {
  e.preventDefault();
  const nama = document.getElementById('nama-kategori').value;
  const { error } = await supabaseClient.from('categories').insert([{ nama_kategori: nama }]);
  if (error) alert('Gagal menambah kategori: ' + error.message);
  else {
    document.getElementById('nama-kategori').value = '';
    loadCategories();
    alert('Kategori berhasil ditambahkan!');
  }
}

// --- TEMPLATE UPLOAD TUGAS ---
function changeTemplateForm() {
  const type = document.getElementById('template-type').value;
  const descSec = document.getElementById('section-deskripsi');
  const stepSec = document.getElementById('section-steps');

  descSec.classList.add('d-none');
  stepSec.classList.add('d-none');

  if (type === 'tutorial') {
    stepSec.classList.remove('d-none');
  } else if (type === 'komplit') {
    descSec.classList.remove('d-none');
    stepSec.classList.remove('d-none');
  }
}

function addStepRow() {
  const container = document.getElementById('steps-container');
  const rowCount = container.children.length + 1;
  const div = document.createElement('div');
  div.className = 'card p-3 mb-2 bg-light border-0 step-row';
  div.innerHTML = `
    <div class="d-flex justify-content-between mb-1">
      <span class="fw-bold text-primary">Langkah #${rowCount}</span>
      <button type="button" class="btn btn-sm text-danger" onclick="this.closest('.step-row').remove()"><i class="bi bi-trash"></i> Hapus</button>
    </div>
    <div class="mb-2">
      <textarea class="form-control step-text" placeholder="Penjelasan langkah..." rows="2" required></textarea>
    </div>
    <div>
      <label class="form-label small text-muted">Gambar Ilustrasi Langkah (Opsional)</label>
      <input type="file" class="form-control form-control-sm step-image">
    </div>
  `;
  container.appendChild(div);
}

async function submitTask(e) {
  e.preventDefault();
  const title = document.getElementById('task-title').value;
  const catId = document.getElementById('task-category').value;
  const pass = document.getElementById('task-password').value;
  const templateType = document.getElementById('template-type').value;
  const desc = document.getElementById('task-description').value;
  const mainFile = document.getElementById('main-file').files[0];
  const btn = document.getElementById('btn-submit-task');

  if (!mainFile) {
    alert('Harap pilih file utama tugas!');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Mengunggah file & data...';

  // 1. Upload file utama ke Storage
  const fileExt = mainFile.name.split('.').pop();
  const fileName = `${Date.now()}_main.${fileExt}`;
  const { data: fileData, error: fileError } = await supabaseClient.storage.from('arsip-files').upload(fileName, mainFile);

  if (fileError) {
    alert('Gagal upload file: ' + fileError.message);
    btn.disabled = false;
    btn.textContent = 'Publikasikan Tugas';
    return;
  }

  const { data: pubUrl } = supabaseClient.storage.from('arsip-files').getPublicUrl(fileName);

  // 2. Simpan data ke tabel tasks
  const { data: taskInsert, error: taskError } = await supabaseClient.from('tasks').insert([{
    judul: title,
    kategori_id: catId,
    template_type: templateType,
    deskripsi: desc,
    file_url: pubUrl.publicUrl,
    file_name: mainFile.name,
    file_size: (mainFile.size / (1024*1024)).toFixed(2) + ' MB',
    file_password: pass,
    uploaded_by: currentProfile.id
  }]).select().single();

  if (taskError) {
    alert('Gagal simpan tugas: ' + taskError.message);
    btn.disabled = false;
    btn.textContent = 'Publikasikan Tugas';
    return;
  }

  const taskId = taskInsert.id;

  // 3. Jika ada langkah-langkah bergambar
  if (templateType === 'tutorial' || templateType === 'komplit') {
    const stepRows = document.querySelectorAll('.step-row');
    for (let i = 0; i < stepRows.length; i++) {
      const row = stepRows[i];
      const stepText = row.querySelector('.step-text').value;
      const stepImgFile = row.querySelector('.step-image').files[0];
      let stepImgUrl = null;

      if (stepImgFile) {
        const imgExt = stepImgFile.name.split('.').pop();
        const imgName = `${Date.now()}_step_${i+1}.${imgExt}`;
        const { data: imgUpload } = await supabaseClient.storage.from('arsip-files').upload(imgName, stepImgFile);
        if (imgUpload) {
          const { data: imgPub } = supabaseClient.storage.from('arsip-files').getPublicUrl(imgName);
          stepImgUrl = imgPub.publicUrl;
        }
      }

      await supabaseClient.from('task_steps').insert([{
        task_id: taskId,
        step_number: i + 1,
        step_text: stepText,
        step_image_url: stepImgUrl
      }]);
    }
  }

  // 4. Catat riwayat aktivitas
  await supabaseClient.from('activity_logs').insert([{
    user_id: currentProfile.id,
    task_id: taskId,
    action: 'UPLOAD',
    detail: `Mengunggah tugas: ${title}`
  }]);

  alert('Tugas berhasil dipublikasikan!');
  document.getElementById('upload-task-form').reset();
  document.getElementById('steps-container').innerHTML = '';
  btn.disabled = false;
  btn.textContent = 'Publikasikan Tugas';
  switchTab('dashboard');
  loadDashboardStats();
  loadTasks();
}

// --- DETAIL & DOWNLOAD BER-PASSWORD ---
async function openTaskDetail(taskId) {
  const { data: task } = await supabaseClient.from('tasks').select('*, categories(nama_kategori)').eq('id', taskId).single();
  const { data: steps } = await supabaseClient.from('task_steps').select('*').eq('task_id', taskId).order('step_number', { ascending: true });

  if (!task) return;

  activeTaskForDownload = task;
  document.getElementById('modal-task-title').textContent = task.judul;
  document.getElementById('input-download-password').value = '';

  let html = `
    <p><strong>Kategori:</strong> <span class="badge bg-secondary">${task.categories?.nama_kategori || 'Umum'}</span></p>
    <p><strong>Ukuran File:</strong> ${task.file_size || 'Tidak diketahui'}</p>
  `;

  if (task.deskripsi) {
    html += `<div class="mb-3 p-3 bg-light rounded"><strong>Deskripsi:</strong><p class="mb-0">${task.deskripsi}</p></div>`;
  }

  if (steps && steps.length > 0) {
    html += `<hr><h6 class="fw-bold mb-3">Tata Cara / Langkah-Langkah:</h6>`;
    steps.forEach(s => {
      html += `
        <div class="card mb-3 p-3 border-0 bg-light">
          <span class="badge bg-primary w-auto mb-2">Langkah ${s.step_number}</span>
          <p class="mb-2">${s.step_text}</p>
          ${s.step_image_url ? `<img src="${s.step_image_url}" class="img-fluid rounded border" style="max-height: 250px; object-fit: contain;">` : ''}
        </div>
      `;
    });
  } else {
    html += `<div class="alert alert-info">File ini menggunakan Template Cepat (langsung download tanpa langkah-langkah teks).</div>`;
  }

  document.getElementById('modal-task-body').innerHTML = html;
  new bootstrap.Modal(document.getElementById('modal-detail')).show();
}

async function verifyAndDownload() {
  const inputPass = document.getElementById('input-download-password').value;
  if (!activeTaskForDownload) return;

  if (inputPass !== activeTaskForDownload.file_password) {
    alert('Password file salah! Hubungi admin jika lupa.');
    return;
  }

  // Catat riwayat download
  await supabaseClient.from('activity_logs').insert([{
    user_id: currentProfile.id,
    task_id: activeTaskForDownload.id,
    action: 'DOWNLOAD',
    detail: `Mengunduh file: ${activeTaskForDownload.judul}`
  }]);

  // Buka file di tab baru
  window.open(activeTaskForDownload.file_url, '_blank');
}

// --- CHAT UNIVERSAL REAL-TIME ---
async function loadChatMessages() {
  const { data: messages } = await supabaseClient
    .from('chat_messages')
    .select('*, profiles(nama_lengkap, role)')
    .order('created_at', { ascending: true })
    .limit(50);

  const chatBox = document.getElementById('chat-box');
  if (!messages || messages.length === 0) {
    chatBox.innerHTML = `<div class="text-center text-muted my-5">Belum ada percakapan. Mulai chat di sini!</div>`;
    return;
  }

  chatBox.innerHTML = messages.map(m => {
    const isAdmin = m.profiles?.role === 'admin';
    const badge = isAdmin ? `<span class="badge bg-warning text-dark ms-1" style="font-size: 0.65rem;">[ADMIN]</span>` : `<span class="badge bg-secondary ms-1" style="font-size: 0.65rem;">USER</span>`;
    const timeStr = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    return `
      <div class="mb-2 p-2 rounded ${isAdmin ? 'bg-warning bg-opacity-10 border border-warning' : 'bg-white border'}">
        <div class="d-flex justify-content-between">
          <span class="fw-bold small text-dark">${m.profiles?.nama_lengkap || 'Pengguna'} ${badge}</span>
          <span class="text-muted" style="font-size: 0.7rem;">${timeStr}</span>
        </div>
        <p class="mb-0 mt-1 text-secondary" style="font-size: 0.95rem; word-break: break-word;">${m.message_text}</p>
      </div>
    `;
  }).join('');
  chatBox.scrollTop = chatBox.scrollHeight;
}

function setupRealtimeChat() {
  supabaseClient
    .channel('public:chat_messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
      loadChatMessages();
    })
    .subscribe();
}

async function sendChatMessage(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;

  await supabaseClient.from('chat_messages').insert([{
    user_id: currentProfile.id,
    message_text: text
  }]);

  input.value = '';
}

// --- MANAJEMEN USER & RIWAYAT (ADMIN) ---
async function loadUsers() {
  const { data: users } = await supabaseClient.from('profiles').select('*').order('created_at', { ascending: false });
  const tbody = document.getElementById('user-table-body');
  
  if (!users) return;
  tbody.innerHTML = users.map(u => `
    <tr>
      <td class="fw-semibold">${u.username || '-'}</td>
      <td>${u.nama_lengkap}</td>
      <td><span class="badge ${u.role === 'admin' ? 'bg-warning text-dark' : 'bg-primary'}">${u.role.toUpperCase()}</span></td>
      <td><small class="text-muted">Akun aktif</small></td>
    </tr>
  `).join('');
}

async function loadLogs() {
  const { data: logs } = await supabaseClient
    .from('activity_logs')
    .select('*, profiles(nama_lengkap)')
    .order('created_at', { ascending: false })
    .limit(50);

  const tbody = document.getElementById('log-table-body');
  if (!logs) return;

  tbody.innerHTML = logs.map(l => `
    <tr>
      <td><small class="text-muted">${new Date(l.created_at).toLocaleString('id-ID')}</small></td>
      <td class="fw-semibold">${l.profiles?.nama_lengkap || 'Sistem'}</td>
      <td><span class="badge ${l.action === 'UPLOAD' ? 'bg-warning text-dark' : 'bg-success'}">${l.action}</span></td>
      <td>${l.detail || '-'}</td>
    </tr>
  `).join('');
}