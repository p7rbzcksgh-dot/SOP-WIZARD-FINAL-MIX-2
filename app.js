
const STORE_PREFIX = 'tcg-sop-wizard:';
let currentDraftId = null;
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const icons = {
  camera:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="14" r="4"/></svg>',
  plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
};

document.addEventListener('DOMContentLoaded', () => {
  initMenu();
  if ($('#sopForm')) initSopBuilder();
  if ($('#savedList')) renderSavedList();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
});

function initMenu(){
  const menu = $('#sideMenu');
  const shade = $('.menu-shade');
  const open = () => { menu?.classList.add('open'); shade?.classList.add('open'); menu?.setAttribute('aria-hidden','false'); };
  const close = () => { menu?.classList.remove('open'); shade?.classList.remove('open'); menu?.setAttribute('aria-hidden','true'); };
  $$('[data-menu-toggle]').forEach(btn => btn.addEventListener('click', open));
  $$('[data-menu-close]').forEach(btn => btn.addEventListener('click', close));
  document.addEventListener('keydown', e => { if(e.key === 'Escape') close(); });
}

function initSopBuilder(){
  const params = new URLSearchParams(location.search);
  currentDraftId = params.get('id');
  const date = $('#sopDate');
  if (date && !date.value) date.value = new Date().toISOString().slice(0,10);

  const template = params.get('template');
  if (currentDraftId) {
    const record = getDraft(currentDraftId);
    if (record?.sop) loadSop(record.sop); else addStep();
  } else if (template) {
    loadTemplate(decodeURIComponent(template));
  } else {
    addStep({number:'1'});
  }
  $('#addStepBtn')?.addEventListener('click', () => addStep());
  $('#addStepTopBtn')?.addEventListener('click', () => addStep());
  $('#saveDraftBtn')?.addEventListener('click', saveDraft);
  $('#exportHtmlBtn')?.addEventListener('click', () => exportHtml(collectSop()));
  $('#printPdfBtn')?.addEventListener('click', () => printPdf(collectSop()));
  $('#stepsWrap')?.addEventListener('click', handleStepClick);
  $('#stepsWrap')?.addEventListener('change', handleStepChange);
}

function loadTemplate(dept){
  $('#department').value = dept;
  $('#sopTitle').value = dept + ' SOP Template';
  $('#revision').value = 'R01';
  addStep({number:'1', title:'Prepare Work Area', instructions:'Confirm the work area is clean, organized, and ready. Add a setup photo before starting.', parts:[]});
  addStep({number:'2', title:'Complete Build / Process Step', instructions:'Document the process exactly how the builder should complete it. Add parts and photos inside this step.', parts:[{}]});
  addStep({number:'3', title:'Quality Check / Handoff', instructions:'Record pass/fail checks, inspection notes, and handoff details.', parts:[]});
}

function handleStepClick(e){
  const removeStep = e.target.closest('[data-remove-step]');
  if (removeStep) {
    const step = removeStep.closest('.sop-step');
    if ($$('.sop-step').length === 1) { toast('At least one step is required.'); return; }
    step.remove(); renumberSteps(); return;
  }
  const addPart = e.target.closest('[data-add-part]');
  if (addPart) { addPartRow(addPart.closest('.sop-step').querySelector('.parts-list')); return; }
  const removePart = e.target.closest('[data-remove-part]');
  if (removePart) {
    const list = removePart.closest('.parts-list');
    const row = removePart.closest('.part-row');
    if ($$('.part-row', list).length === 1) $$('input', row).forEach(i => i.value = ''); else row.remove();
    return;
  }
  const removePhoto = e.target.closest('[data-remove-photo]');
  if (removePhoto) { removePhoto.closest('figure').remove(); return; }
}

function handleStepChange(e){
  const input = e.target.closest('[data-photo-input]');
  if (!input || !input.files?.length) return;
  const step = input.closest('.sop-step');
  const grid = step.querySelector('.photo-grid');
  const files = Array.from(input.files).filter(file => file.type.startsWith('image/'));
  if (!files.length) return;
  const status = step.querySelector('[data-photo-status]');
  if (status) status.textContent = 'Processing photos...';
  Promise.all(files.map(fileToCompressedDataUrl)).then(images => {
    images.forEach(src => appendPhoto(grid, src));
    if (status) status.textContent = images.length + ' photo(s) added to this step.';
    input.value = '';
  }).catch(err => { console.error(err); if(status) status.textContent='Photo upload failed'; toast('Photo upload failed. Try a smaller image.'); });
}

function fileToCompressedDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const max = 1400;
        const scale = Math.min(max / img.width, max / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function addStep(data={}){
  const wrap = $('#stepsWrap'); if (!wrap) return;
  const index = $$('.sop-step', wrap).length + 1;
  const step = document.createElement('section');
  step.className = 'sop-step';
  step.dataset.step = String(index);
  step.innerHTML = `
    <div class="step-card-head">
      <div class="step-badge">Step <strong data-step-display>${escapeHTML(data.number || index)}</strong></div>
      <button type="button" class="remove-step" data-remove-step aria-label="Remove step">×</button>
    </div>
    <div class="step-fields">
      <div class="step-two-col">
        <label>Step Number<input data-step-number value="${escapeAttr(data.number || index)}" placeholder="${index}"></label>
        <label>Step Title<input data-step-title placeholder="e.g., Install roller shaft set" value="${escapeAttr(data.title || '')}"></label>
      </div>
      <label>Build Instructions<textarea data-step-instructions placeholder="Write the step exactly how the builder should do it...">${escapeText(data.instructions || '')}</textarea></label>
      <label>Quality / Safety Notes <span class="optional-text">Optional</span><textarea data-step-quality placeholder="Orientation checks, warnings, torque notes, inspection requirements...">${escapeText(data.quality || '')}</textarea></label>
    </div>
    <div class="photo-panel">
      <div class="mini-panel-head"><h3>Step Photos</h3><span data-photo-status class="photo-status">Add as many photos as needed.</span></div>
      <label class="photo-label">${icons.camera} Add / Take Photos<input data-photo-input type="file" accept="image/*" capture="environment" multiple></label>
      <div class="photo-grid"></div>
    </div>
    <div class="parts-panel">
      <div class="parts-head"><h3>Parts Used In This Step</h3><button type="button" class="small-link" data-add-part>+ Add Part Line</button></div>
      <div class="parts-list"></div>
    </div>`;
  wrap.appendChild(step);
  const list = step.querySelector('.parts-list');
  const parts = Array.isArray(data.parts) && data.parts.length ? data.parts : [{}];
  parts.forEach(part => addPartRow(list, part));
  if (Array.isArray(data.photos)) data.photos.forEach(src => appendPhoto(step.querySelector('.photo-grid'), src));
  renumberSteps(false);
  step.scrollIntoView({behavior:'smooth', block:'nearest'});
}

function addPartRow(list, part={}){
  const row = document.createElement('div');
  row.className = 'part-row';
  row.innerHTML = `
    <label>Part #<input data-part-number placeholder="Part #" value="${escapeAttr(part.number || '')}"></label>
    <label>Qty<input data-part-qty type="number" inputmode="decimal" min="0" step="0.01" placeholder="Qty" value="${escapeAttr(part.qty || '')}"></label>
    <label>Description<input data-part-desc placeholder="Description" value="${escapeAttr(part.description || '')}"></label>
    <button type="button" class="icon-remove" data-remove-part aria-label="Remove part">×</button>`;
  list.appendChild(row);
}

function appendPhoto(grid, src){
  const fig = document.createElement('figure');
  fig.className = 'photo-thumb';
  fig.innerHTML = `<img src="${src}" alt="SOP step photo"><button type="button" class="remove-photo" data-remove-photo aria-label="Remove photo">×</button>`;
  grid.appendChild(fig);
}

function renumberSteps(updateEmpty=true){
  $$('.sop-step').forEach((step, idx) => {
    step.dataset.step = String(idx+1);
    const input = step.querySelector('[data-step-number]');
    if (updateEmpty && input && !input.value.trim()) input.value = String(idx+1);
    const display = step.querySelector('[data-step-display]');
    if (display) display.textContent = input?.value?.trim() || String(idx+1);
    input?.addEventListener('input', () => { if(display) display.textContent = input.value.trim() || String(idx+1); }, {once:true});
  });
}

function collectSop(){
  const val = id => ($(id)?.value || '').trim();
  const sop = {
    title: val('#sopTitle'), sopNumber: val('#sopNumber'), date: val('#sopDate'), revision: val('#revision'),
    author: val('#author'), department: val('#department'), updatedAt: new Date().toISOString(), steps: []
  };
  $$('.sop-step').forEach((step, idx) => {
    const parts = $$('.part-row', step).map(row => ({
      number: row.querySelector('[data-part-number]')?.value.trim() || '',
      qty: row.querySelector('[data-part-qty]')?.value.trim() || '',
      description: row.querySelector('[data-part-desc]')?.value.trim() || ''
    })).filter(p => p.number || p.qty || p.description);
    const photos = $$('.photo-grid img', step).map(img => img.src);
    sop.steps.push({
      number: step.querySelector('[data-step-number]')?.value.trim() || String(idx+1),
      title: step.querySelector('[data-step-title]')?.value.trim() || '',
      instructions: step.querySelector('[data-step-instructions]')?.value.trim() || '',
      quality: step.querySelector('[data-step-quality]')?.value.trim() || '',
      parts, photos
    });
  });
  return sop;
}

function loadSop(sop){
  $('#sopTitle').value = sop.title || '';
  $('#sopNumber').value = sop.sopNumber || '';
  $('#sopDate').value = sop.date || new Date().toISOString().slice(0,10);
  $('#revision').value = sop.revision || '';
  $('#author').value = sop.author || '';
  $('#department').value = sop.department || 'Assembly';
  $('#stepsWrap').innerHTML = '';
  if (sop.steps?.length) sop.steps.forEach(addStep); else addStep();
}

function saveDraft(){
  const sop = collectSop();
  if (!sop.title) { toast('Add an SOP title before saving.'); $('#sopTitle')?.focus(); return; }
  if (!currentDraftId) currentDraftId = 'draft-' + Date.now();
  const record = { id: currentDraftId, updatedAt: new Date().toISOString(), sop };
  try {
    localStorage.setItem(STORE_PREFIX + currentDraftId, JSON.stringify(record));
    history.replaceState(null, '', 'create-sop.html?id=' + encodeURIComponent(currentDraftId));
    toast('Draft saved on this device.');
  } catch (err) { console.error(err); toast('Draft is too large to save locally. Export HTML instead.'); }
}

function getDraft(id){ try { return JSON.parse(localStorage.getItem(STORE_PREFIX + id) || 'null'); } catch(e){ return null; } }
function allDrafts(){
  const records=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(key?.startsWith(STORE_PREFIX)){ try{ const rec=JSON.parse(localStorage.getItem(key)); if(rec?.sop) records.push(rec); }catch(e){} }
  }
  return records.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
}

function renderSavedList(){
  const list=$('#savedList'); if(!list) return;
  const drafts=allDrafts();
  if(!drafts.length){
    list.innerHTML = `<div class="empty-state glass-card"><img src="tcg-cogs-branding.png" alt=""><h2>No saved SOPs yet</h2><p>Create a new SOP and tap Save Draft. Drafts stay on this device until exported or browser data is cleared.</p><a class="glow-btn" href="create-sop.html">${icons.plus} Create A New SOP</a></div>`;
    return;
  }
  list.innerHTML = drafts.map(rec => `<article class="saved-card"><h2>${escapeHTML(rec.sop.title || 'Untitled SOP')}</h2><p>${escapeHTML(rec.sop.department || '')} · ${escapeHTML(rec.sop.revision || '')} · ${new Date(rec.updatedAt).toLocaleString()}</p><div class="saved-actions"><a class="glow-btn" href="create-sop.html?id=${encodeURIComponent(rec.id)}">Open Draft</a><button class="glow-btn" type="button" data-export-saved="${escapeAttr(rec.id)}">Export HTML</button><button class="glow-btn" type="button" data-delete-saved="${escapeAttr(rec.id)}">Delete</button></div></article>`).join('');
  list.addEventListener('click', e => {
    const exp=e.target.closest('[data-export-saved]');
    if(exp){ const rec=getDraft(exp.dataset.exportSaved); if(rec?.sop) exportHtml(rec.sop); }
    const del=e.target.closest('[data-delete-saved]');
    if(del && confirm('Delete this saved draft from this device?')){ localStorage.removeItem(STORE_PREFIX + del.dataset.deleteSaved); renderSavedList(); }
  }, {once:true});
}

function exportHtml(sop){
  if(!sop.title){ toast('Add an SOP title before exporting.'); $('#sopTitle')?.focus(); return; }
  const html = buildExportHtml(sop);
  const blob = new Blob([html], {type:'text/html;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=safeFileName(`${sop.sopNumber || sop.title || 'TCG-SOP'}.html`);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  toast('HTML export downloaded.');
}

function printPdf(sop){
  if(!sop.title){ toast('Add an SOP title before printing.'); $('#sopTitle')?.focus(); return; }
  const win = window.open('', '_blank');
  if(!win){ toast('Popup blocked. Allow popups to print/save PDF.'); return; }
  win.document.open();
  win.document.write(buildExportHtml(sop));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 650);
}

function buildExportHtml(sop){
  const rows = [
    ['SOP Title', sop.title], ['SOP Number', sop.sopNumber], ['Date', sop.date], ['Revision', sop.revision], ['Author', sop.author], ['Department', sop.department]
  ].map(([k,v])=>`<tr><th>${k}</th><td>${escapeHTML(v||'')}</td></tr>`).join('');
  const steps = sop.steps.map(step => {
    const parts = step.parts.length ? `<table class="parts"><thead><tr><th>Part #</th><th>Qty</th><th>Description</th></tr></thead><tbody>${step.parts.map(p=>`<tr><td>${escapeHTML(p.number)}</td><td>${escapeHTML(p.qty)}</td><td>${escapeHTML(p.description)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No parts listed for this step.</p>';
    const photos = step.photos.length ? `<div class="photos">${step.photos.map(src=>`<img src="${src}" alt="Step photo">`).join('')}</div>` : '<p class="muted">No photos added.</p>';
    return `<section class="step"><h2>Step ${escapeHTML(step.number)}: ${escapeHTML(step.title || '')}</h2><h3>Instructions</h3><p>${nl2br(escapeHTML(step.instructions || ''))}</p>${step.quality ? `<h3>Quality / Safety Notes</h3><p>${nl2br(escapeHTML(step.quality))}</p>`:''}<h3>Parts Used</h3>${parts}<h3>Photos</h3>${photos}</section>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(sop.title)} | TCG SOP</title><style>
    body{font-family:Arial,system-ui,sans-serif;margin:0;background:#f7f7f7;color:#111}main{max-width:980px;margin:0 auto;padding:28px}.cover{background:#111;color:#fff;padding:24px;border-radius:18px}.cover h1{margin:0 0 8px;text-transform:uppercase}.meta{width:100%;border-collapse:collapse;margin:18px 0;background:#fff}.meta th,.meta td,.parts th,.parts td{border:1px solid #ddd;padding:8px;text-align:left}.meta th{width:180px;background:#f0f0f0}.step{background:#fff;border:1px solid #ddd;border-radius:16px;margin:18px 0;padding:20px;break-inside:avoid}.step h2{color:#d86600;margin-top:0}.step h3{margin-bottom:6px}.parts{width:100%;border-collapse:collapse}.parts th{background:#f0f0f0}.photos{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.photos img{width:100%;border-radius:10px;border:1px solid #ddd}.muted{color:#666}@media print{body{background:#fff}main{padding:0}.cover,.step{border-radius:0}}
  </style></head><body><main><section class="cover"><h1>${escapeHTML(sop.title)}</h1><p>TCG Machines Standard Operating Procedure</p></section><table class="meta"><tbody>${rows}</tbody></table>${steps}</main></body></html>`;
}

function toast(msg){
  let t=$('.toast');
  if(!t){ t=document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
  t.textContent=msg; t.classList.add('show');
  clearTimeout(toast._timer); toast._timer=setTimeout(()=>t.classList.remove('show'), 2600);
}
function safeFileName(name){ return name.replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,'_'); }
function escapeHTML(str=''){ return String(str).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escapeAttr(str=''){ return escapeHTML(str).replace(/`/g,'&#96;'); }
function escapeText(str=''){ return escapeHTML(str); }
function nl2br(str=''){ return String(str).replace(/\n/g,'<br>'); }
