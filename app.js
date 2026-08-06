// --- अपनी Supabase जानकारी यहाँ डालें ---
const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Tab Switcher
function switchTab(tab) {
  const uploadSec = document.getElementById('upload-section');
  const editorSec = document.getElementById('editor-section');
  const uploadBtn = document.getElementById('tab-upload-btn');
  const editorBtn = document.getElementById('tab-editor-btn');

  if (tab === 'upload') {
    uploadSec.classList.remove('hidden');
    editorSec.classList.add('hidden');
    uploadBtn.className = "py-2 px-4 border-b-2 border-blue-600 font-semibold text-blue-600";
    editorBtn.className = "py-2 px-4 border-b-2 border-transparent font-semibold text-gray-500 hover:text-blue-600";
  } else {
    uploadSec.classList.add('hidden');
    editorSec.classList.remove('hidden');
    editorBtn.className = "py-2 px-4 border-b-2 border-blue-600 font-semibold text-blue-600";
    uploadBtn.className = "py-2 px-4 border-b-2 border-transparent font-semibold text-gray-500 hover:text-blue-600";
    if (!window.quill) {
      window.quill = new Quill('#editor-container', { theme: 'snow' });
    }
  }
}

// Helper: Get Expiry Date
function getExpiryDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + parseInt(days));
  return date.toISOString();
}

// 1. Upload File
async function uploadFile() {
  const fileInput = document.getElementById('file-input');
  const password = document.getElementById('file-password').value;
  const expiryDays = document.getElementById('file-expiry').value;

  if (!fileInput.files.length) return alert('कृपया फ़ाइल चुनें!');

  const file = fileInput.files[0];
  const filePath = `${Date.now()}_${file.name}`;

  // Upload to Supabase Storage
  const { data: storageData, error: storageErr } = await supabase.storage.from('uploads').upload(filePath, file);
  if (storageErr) return alert('अपलोड में समस्या: ' + storageErr.message);

  const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(filePath);

  // Insert Record to DB
  const { data: dbData, error: dbErr } = await supabase.from('shared_files').insert([{
    file_name: file.name,
    file_url: urlData.publicUrl,
    password_hash: password || null,
    expires_at: getExpiryDate(expiryDays),
    is_editable: false
  }]).select().single();

  if (dbErr) return alert('डेटाबेस एरर: ' + dbErr.message);

  showResultLink(dbData.id);
}

// 2. Save Online Document
async function saveAndShareDocument() {
  const title = document.getElementById('doc-title').value || 'document.html';
  const content = window.quill.root.innerHTML;
  const password = document.getElementById('doc-password').value;
  const expiryDays = document.getElementById('doc-expiry').value;

  const blob = new Blob([content], { type: 'text/html' });
  const file = new File([blob], title, { type: 'text/html' });
  const filePath = `docs/${Date.now()}_${title}`;

  // Upload HTML to Storage
  const { data: storageData, error: storageErr } = await supabase.storage.from('uploads').upload(filePath, file);
  if (storageErr) return alert('एरर: ' + storageErr.message);

  const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(filePath);

  // Insert Record to DB
  const { data: dbData, error: dbErr } = await supabase.from('shared_files').insert([{
    file_name: title,
    file_url: urlData.publicUrl,
    password_hash: password || null,
    expires_at: getExpiryDate(expiryDays),
    is_editable: true,
    content: content
  }]).select().single();

  if (dbErr) return alert('डेटाबेस एरर: ' + dbErr.message);

  showResultLink(dbData.id);
}

// Show Generated Link
function showResultLink(id) {
  const baseUrl = window.location.href.replace('index.html', '').split('?')[0];
  const shareUrl = `${baseUrl}share.html?id=${id}`;
  
  document.getElementById('share-link-input').value = shareUrl;
  document.getElementById('result-area').classList.remove('hidden');
}

function copyLink() {
  const input = document.getElementById('share-link-input');
  input.select();
  navigator.clipboard.writeText(input.value);
  alert('शेयरिंग लिंक कॉपी हो गया!');
}

// 3. Share Page Handling Logic
let currentFileData = null;

async function initSharePage() {
  const urlParams = new URLSearchParams(window.location.search);
  const fileId = urlParams.get('id');

  if (!fileId) {
    document.getElementById('status-msg').innerText = "अमान्य लिंक!";
    return;
  }

  const { data, error } = await supabase.from('shared_files').select('*').eq('id', fileId).single();

  if (error || !data) {
    document.getElementById('status-msg').innerText = "फ़ाइल नहीं मिली या लिंक हटा दिया गया है।";
    return;
  }

  // Check Expiry Date
  if (new Date() > new Date(data.expires_at)) {
    document.getElementById('status-msg').innerText = "यह लिंक एक्सपायर (समाप्त) हो चुका है!";
    return;
  }

  currentFileData = data;
  document.getElementById('file-title').innerText = data.file_name;

  if (data.password_hash) {
    document.getElementById('status-msg').innerText = "एक्सेस के लिए पासवर्ड दर्ज करें:";
    document.getElementById('password-box').classList.remove('hidden');
  } else {
    grantAccess();
  }
}

function verifyAccess() {
  const pwd = document.getElementById('access-password').value;
  if (pwd === currentFileData.password_hash) {
    grantAccess();
  } else {
    alert('गलत पासवर्ड!');
  }
}

function grantAccess() {
  document.getElementById('status-msg').innerText = "एक्सेस स्वीकृत!";
  document.getElementById('password-box').classList.add('hidden');
  document.getElementById('action-box').classList.remove('hidden');

  const dlBtn = document.getElementById('download-btn');
  dlBtn.href = currentFileData.file_url;

  if (currentFileData.is_editable && currentFileData.content) {
    const editArea = document.getElementById('editable-content');
    editArea.classList.remove('hidden');
    editArea.innerHTML = `<strong>ऑनलाइन कंटेंट:</strong><br>${currentFileData.content}`;
  }
}
