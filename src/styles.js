export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');

:root{
  --bg:#F5F6F9; --surface:#FFFFFF; --surface-2:#FBFBFD;
  --ink:#1B2333; --ink-2:#586074; --muted:#8A93A6;
  --line:#E6E9F0; --line-2:#EEF0F5;
  --accent:#4338CA; --accent-2:#5B50E6; --accent-weak:#EEEDFB;
  --p-urgent:#E5484D; --p-high:#EA8033; --p-medium:#3E77E0; --p-low:#A6AEBD;
  --s-backlog:#94A3B8; --s-design:#8B5CF6; --s-review:#6366F1;
  --s-dev:#3B82F6; --s-qa:#F59E0B; --s-done:#22C55E;
  --font-display:'Space Grotesk','Segoe UI',system-ui,sans-serif;
  --font-body:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  --shadow:0 1px 2px rgba(20,28,48,.05),0 1px 3px rgba(20,28,48,.04);
  --shadow-lg:0 12px 40px rgba(20,28,48,.18);
}
*{box-sizing:border-box;}
.app{
  height:100vh; display:flex; flex-direction:column;
  background:var(--bg); color:var(--ink);
  font-family:var(--font-body); font-size:14px; -webkit-font-smoothing:antialiased;
}
.app *::-webkit-scrollbar{height:10px;width:10px;}
.app *::-webkit-scrollbar-thumb{background:#D3D8E2;border-radius:8px;border:2px solid transparent;background-clip:content-box;}
.app *::-webkit-scrollbar-thumb:hover{background:#BCC3D1;background-clip:content-box;}
.app *::-webkit-scrollbar-track{background:transparent;}

/* ---- shell layout ---- */
.shell{flex-direction:row;}
.sidebar{
  flex:0 0 220px;width:220px;height:100vh;overflow-y:auto;
  background:var(--surface);border-right:1px solid var(--line);
  padding:16px 12px;display:flex;flex-direction:column;
}
.sidebar-close{display:none;}
.menu-toggle{
  display:none;border:1px solid var(--line);background:var(--surface-2);color:var(--ink-2);
  border-radius:9px;padding:7px;align-items:center;justify-content:center;cursor:pointer;flex:none;margin-right:2px;
}
.sidebar-overlay{display:none;}
.sidebar-section-lbl{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);padding:0 8px 6px;}
.sidebar-list{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-direction:column;gap:1px;}
.sidebar-item{display:flex;align-items:center;gap:2px;}
.sidebar-link{
  flex:1;display:flex;align-items:center;gap:8px;min-width:0;
  padding:7px 8px;border-radius:8px;font-size:13px;font-weight:550;color:var(--ink-2);
  text-decoration:none;transition:background .12s,color .12s;
}
.sidebar-link:hover{background:var(--surface-2);color:var(--ink);}
.sidebar-link.active{background:var(--accent-weak);color:var(--accent);}
.sidebar-project-key{font-size:10px;font-weight:700;letter-spacing:.02em;color:var(--muted);background:var(--line-2);border-radius:5px;padding:2px 5px;flex:none;}
.sidebar-link.active .sidebar-project-key{color:var(--accent);background:#fff;}
.sidebar-project-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sidebar-settings-link{color:var(--muted);display:grid;place-items:center;padding:6px;border-radius:7px;flex:none;}
.sidebar-settings-link:hover{background:var(--line-2);color:var(--ink);}
.sidebar-add{
  font-family:inherit;font-size:12.5px;font-weight:600;color:var(--ink-2);
  background:transparent;border:1px dashed #C9CFDB;border-radius:9px;
  padding:8px;display:flex;align-items:center;justify-content:center;gap:5px;cursor:pointer;transition:all .14s;margin:2px 0;
}
.sidebar-add:hover{border-color:var(--accent);color:var(--accent);background:var(--surface-2);}
.sidebar-create{display:flex;flex-direction:column;gap:7px;padding:8px;background:var(--surface-2);border-radius:10px;border:1px solid var(--line);}
.sidebar-create .in{font-size:12.5px;padding:7px 9px;}

.main-col{flex:1;min-width:0;display:flex;flex-direction:column;height:100vh;}
.page-outlet{flex:1;min-height:0;display:flex;flex-direction:column;}
.board-page{flex:1;min-height:0;display:flex;flex-direction:column;}
.settings-page{flex:1;overflow-y:auto;padding:24px 28px;max-width:640px;}

/* ---- top bar ---- */
.topbar{
  display:flex;align-items:center;gap:16px;flex-wrap:wrap;
  padding:12px 20px;background:var(--surface);
  border-bottom:1px solid var(--line);flex:none;
}
.brand{display:flex;align-items:center;gap:11px;margin-right:auto;}
.mark{
  width:30px;height:30px;border-radius:9px;display:grid;place-items:center;
  background:var(--accent);color:#fff;
  box-shadow:inset 0 -2px 4px rgba(0,0,0,.15);
}
.brand-txt{display:flex;flex-direction:column;line-height:1.05;}
.brand-txt h1{font-family:var(--font-display);font-size:18px;font-weight:600;margin:0;letter-spacing:-.01em;}
.brand-sub{font-size:11.5px;color:var(--muted);font-weight:500;margin-top:1px;}

.tools{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-left:auto;}

.notif-wrap{position:relative;}
.notif-bell{position:relative;}
.notif-badge{
  position:absolute;top:2px;right:2px;min-width:15px;height:15px;padding:0 3px;
  border-radius:20px;background:var(--p-urgent);color:#fff;font-size:9.5px;font-weight:700;
  display:grid;place-items:center;line-height:1;box-shadow:0 0 0 2px var(--surface);
}
.notif-panel{
  position:absolute;top:100%;right:0;margin-top:8px;width:320px;max-height:400px;
  background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);
  overflow:hidden;z-index:30;display:flex;flex-direction:column;
}
.notif-panel-head{
  display:flex;align-items:center;justify-content:space-between;gap:8px;
  font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--muted);padding:11px 14px 7px;
}
.notif-mark-all{
  font-family:inherit;font-size:10.5px;font-weight:700;text-transform:none;letter-spacing:0;
  color:var(--accent);background:none;border:none;cursor:pointer;padding:2px 4px;
}
.notif-mark-all:hover{text-decoration:underline;}
.notif-list{list-style:none;margin:0;padding:0 6px 6px;overflow-y:auto;display:flex;flex-direction:column;gap:1px;}
.notif-item{display:flex;align-items:flex-start;gap:9px;padding:9px 8px;border-radius:9px;cursor:pointer;position:relative;}
.notif-item:hover{background:var(--surface-2);}
.notif-item.unread{background:var(--accent-weak);}
.notif-item.unread:hover{background:var(--accent-weak);filter:brightness(0.97);}
.notif-item.unread::before{
  content:'';position:absolute;left:2px;top:16px;width:6px;height:6px;border-radius:50%;background:var(--accent);
}
.notif-avatar{margin-left:8px;margin-top:1px;}
.notif-item-body{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1;}
.notif-item-top{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.notif-item-verb{display:flex;align-items:center;gap:5px;font-size:11.5px;font-weight:500;color:var(--ink-2);}
.notif-item-verb strong{font-weight:700;color:var(--ink);}
.notif-item-icon{flex:none;color:var(--muted);}
.notif-project-key{font-size:10px;font-weight:700;letter-spacing:.03em;color:var(--accent);flex:none;}
.notif-item-title{font-size:13px;font-weight:550;color:var(--ink);line-height:1.35;}
.notif-item-preview{font-size:11.5px;color:var(--muted);line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.notif-item-time{font-size:10.5px;color:var(--muted);}
.searchbox{position:relative;display:flex;align-items:center;}
.search-ic{position:absolute;left:10px;color:var(--muted);pointer-events:none;}
.searchbox input{
  font-family:inherit;font-size:13px;color:var(--ink);
  border:1px solid var(--line);background:var(--surface-2);
  border-radius:9px;padding:8px 26px 8px 30px;width:190px;transition:border-color .15s,background .15s;
}
.searchbox input:focus{outline:none;border-color:var(--accent);background:#fff;box-shadow:0 0 0 3px var(--accent-weak);}
.search-clear{position:absolute;right:6px;border:none;background:none;color:var(--muted);cursor:pointer;padding:3px;display:grid;place-items:center;border-radius:6px;}
.search-clear:hover{background:var(--line-2);color:var(--ink);}

.selwrap{position:relative;}
.sel{
  font-family:inherit;font-size:13px;color:var(--ink);cursor:pointer;
  border:1px solid var(--line);background:var(--surface-2);
  border-radius:9px;padding:8px 30px 8px 11px;
  appearance:none;-webkit-appearance:none;-moz-appearance:none;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238A93A6' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
  background-repeat:no-repeat;background-position:right 10px center;
}
.sel:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-weak);}
.sel.wide{width:100%;}
.sel:disabled{opacity:.6;cursor:not-allowed;}

.overdue-pill{
  display:inline-flex;align-items:center;gap:5px;
  font-size:12px;font-weight:600;color:var(--p-urgent);
  background:#FDECED;border:1px solid #F7C9CB;border-radius:8px;padding:6px 9px;
}

/* ---- buttons ---- */
.btn{
  font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;
  display:inline-flex;align-items:center;gap:6px;
  border-radius:9px;padding:8px 13px;border:1px solid transparent;transition:all .14s;white-space:nowrap;
}
.btn:disabled{opacity:.55;cursor:not-allowed;}
.btn.primary{background:var(--accent);color:#fff;box-shadow:var(--shadow);text-decoration:none;}
.btn.primary:hover:not(:disabled){background:var(--accent-2);}
.btn.ghost{background:var(--surface);color:var(--ink-2);border-color:var(--line);}
.btn.ghost:hover{border-color:#D3D8E2;color:var(--ink);background:var(--surface-2);}
.btn.danger{background:#FDECED;color:var(--p-urgent);}
.btn.danger:hover{background:#FBDCDE;}
.btn.ghost-danger{background:transparent;border-color:transparent;}
.btn.ghost-danger:hover{background:#FDECED;}
.icon-btn{border:none;background:none;color:var(--muted);cursor:pointer;display:grid;place-items:center;border-radius:8px;padding:6px;transition:all .14s;}
.icon-btn:hover{background:var(--line-2);color:var(--ink);}
.icon-btn:disabled{opacity:.4;cursor:not-allowed;}
.icon-btn.small{padding:5px;}

/* ---- loading ---- */
.loading{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:var(--muted);font-size:13px;}
.spinner{width:26px;height:26px;border:3px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite;}
@keyframes spin{to{transform:rotate(360deg);}}

/* ---- 404 ---- */
.notfound{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--muted);text-align:center;padding:40px;}
.notfound h2{font-family:var(--font-display);font-size:19px;font-weight:600;color:var(--ink);margin:10px 0 0;letter-spacing:-.01em;}
.notfound p{font-size:13.5px;max-width:340px;margin:0 0 8px;line-height:1.5;}
.notfound-scene{display:flex;align-items:center;gap:2px;}
.notfound-digit{
  font-family:var(--font-display);font-size:56px;font-weight:700;line-height:1;
  color:var(--accent);animation:notfound-float 2.6s ease-in-out infinite;
}
.notfound-digit-2{animation-delay:.25s;}
.notfound-compass{
  display:grid;place-items:center;width:52px;height:52px;margin:0 2px;border-radius:50%;
  background:var(--accent-weak);color:var(--accent);animation:notfound-spin 7s linear infinite;
}
@keyframes notfound-float{0%,100%{transform:translateY(0);}50%{transform:translateY(-7px);}}
@keyframes notfound-spin{to{transform:rotate(360deg);}}

/* ---- board ---- */
.board{
  flex:1;display:flex;gap:14px;overflow-x:auto;overflow-y:hidden;
  padding:18px 20px 22px;align-items:flex-start;
}
.col{
  flex:0 0 288px;max-width:288px;height:100%;
  display:flex;flex-direction:column;
  background:#EEF0F5;border:1px solid var(--line);border-radius:14px;
  transition:background .15s,box-shadow .15s,border-color .15s;
}
.col.drop{background:var(--accent-weak);border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-weak);}
.col-head{
  display:flex;align-items:center;gap:8px;padding:13px 14px 10px;
}
.dot{width:9px;height:9px;border-radius:50%;flex:none;}
.col-name{font-family:var(--font-display);font-weight:600;font-size:13.5px;letter-spacing:-.01em;}
.col-count{
  margin-left:auto;font-size:12px;font-weight:600;color:var(--ink-2);
  background:var(--surface);border:1px solid var(--line);border-radius:20px;
  min-width:22px;height:20px;padding:0 7px;display:grid;place-items:center;
}
.col-body{
  flex:1;overflow-y:auto;padding:2px 10px 4px;display:flex;flex-direction:column;gap:9px;min-height:36px;
}
.col-add{
  margin:6px 10px 11px;font-family:inherit;font-size:12.5px;font-weight:600;color:var(--ink-2);
  background:transparent;border:1px dashed #C9CFDB;border-radius:9px;
  padding:8px;display:flex;align-items:center;justify-content:center;gap:5px;cursor:pointer;transition:all .14s;
}
.col-add:hover{border-color:var(--accent);color:var(--accent);background:var(--surface);}
.empty{font-size:12px;color:#A6AEBD;text-align:center;padding:14px 4px;font-style:italic;}

/* ---- card ---- */
.card{
  position:relative;background:var(--surface);border:1px solid var(--line);
  border-radius:11px;padding:11px 12px 10px;cursor:pointer;
  box-shadow:var(--shadow);transition:transform .12s,box-shadow .12s,border-color .12s;
  overflow:hidden;flex-shrink:0;
}
.card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--spine);}
.card:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(20,28,48,.10);border-color:#D6DBE6;}
.card:focus-visible{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-weak);}
.card.is-dragging{opacity:.4;transform:rotate(1.5deg);}
.card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:8px;}
.issue-type{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;letter-spacing:.02em;}
.prio{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;}
.prio-dot{width:6px;height:6px;border-radius:50%;}
.card-title{font-size:13.5px;font-weight:550;line-height:1.34;margin:0 0 8px;color:var(--ink);letter-spacing:-.005em;}
.card-meta{font-size:11px;color:var(--muted);font-weight:600;margin:-4px 0 8px;}
.card-labels{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;}
.card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;}
.card-foot-left{display:flex;align-items:center;gap:6px;min-width:0;}
.card-link{
  display:inline-flex;align-items:center;justify-content:center;
  width:20px;height:20px;border-radius:6px;flex:none;
  color:var(--accent);background:var(--accent-weak);transition:background .12s,color .12s;
}
.card-link:hover{background:var(--accent);color:#fff;}
.due{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:600;padding:3px 7px;border-radius:7px;}
.due-normal{color:var(--ink-2);background:var(--surface-2);border:1px solid var(--line);}
.due-empty{color:#AEB6C4;background:transparent;border:1px solid var(--line-2);}
.due-soon{color:#8A5B00;background:#FFF3DB;}
.due-today{color:#8A5B00;background:#FFEAC2;}
.due-overdue{color:var(--p-urgent);background:#FDECED;}
.avatar{
  width:26px;height:26px;border-radius:50%;color:#fff;font-size:10.5px;font-weight:700;
  display:grid;place-items:center;flex:none;letter-spacing:.02em;box-shadow:inset 0 -1px 2px rgba(0,0,0,.12);
}
.avatar.unassigned{background:#E4E7EF!important;color:#A6AEBD;box-shadow:none;}
.avatar.sm{width:28px;height:28px;font-size:11px;}
.avatar.xs{width:22px;height:22px;font-size:9.5px;}
.avatar.outline{
  width:26px;height:26px;background:var(--surface)!important;color:var(--muted);
  border:1.5px dashed var(--line-2);box-shadow:none;
}
.card-people{display:flex;align-items:center;gap:4px;flex:none;}

/* ---- labels ---- */
.label-chip{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:20px;}
.label-chip-x{border:none;background:none;color:inherit;opacity:.6;cursor:pointer;display:grid;place-items:center;padding:0;}
.label-chip-x:hover{opacity:1;}
.label-picker{position:relative;}
.label-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
.label-add-btn{
  display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:600;color:var(--ink-2);
  background:var(--surface-2);border:1px dashed var(--line);border-radius:20px;padding:10px;cursor:pointer;
}
.label-add-btn:hover{border-color:var(--accent);color:var(--accent);}
.label-dropdown{
  margin-top:8px;padding:8px;border:1px solid var(--line);border-radius:11px;background:var(--surface);
  box-shadow:var(--shadow-lg);display:flex;flex-direction:column;gap:2px;max-width:260px;
}
.label-option{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;padding:6px 8px;border-radius:8px;border:none;background:none;text-align:left;cursor:pointer;}
.label-option:hover{background:var(--surface-2);}
.label-swatch{width:10px;height:10px;border-radius:50%;flex:none;}
.label-create{border-top:1px solid var(--line);margin-top:6px;padding-top:8px;display:flex;flex-direction:column;gap:8px;}
.label-swatches{display:flex;gap:6px;flex-wrap:wrap;}
.label-swatch-btn{width:18px;height:18px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0;}
.label-swatch-btn.selected{border-color:var(--ink);}

/* ---- issue detail panel ---- */
.issue-panel{max-width:640px;}
.issue-panel-body{max-height:72vh;overflow-y:auto;}
.issue-title-in{font-size:17px;font-weight:600;font-family:var(--font-display);}
.save-row{display:flex;justify-content:flex-end;}
.created-meta{color:var(--muted);font-size:11.5px;font-weight:600;text-align:center;margin:2px 0 0;}

/* ---- comments ---- */
.comment-thread{display:flex;flex-direction:column;gap:12px;}
.comment-row{display:flex;gap:9px;}
.comment-body{flex:1;min-width:0;}
.comment-meta{display:flex;align-items:center;gap:8px;margin-bottom:2px;}
.comment-author{font-size:12.5px;font-weight:600;}
.comment-time{font-size:11px;color:var(--muted);}
.comment-actions{margin-left:auto;display:flex;gap:2px;}
.comment-text{font-size:13px;line-height:1.5;margin:0;white-space:pre-wrap;}
.comment-edit{margin-top:4px;}
.comment-composer{display:flex;flex-direction:column;gap:8px;margin-top:4px;}
.comment-composer .btn{align-self:flex-end;}
.mention-chip{color:var(--accent);background:var(--accent-weak);border-radius:5px;padding:1px 4px;font-weight:600;}

.mention-input-wrap{position:relative;}
.mention-input-wrap textarea{padding-right:34px;}
.mention-menu{position:absolute;left:0;right:0;bottom:100%;margin-bottom:4px;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow);list-style:none;padding:4px;margin-top:0;max-height:200px;overflow-y:auto;z-index:20;}
.mention-menu-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:7px;font-size:12.5px;cursor:pointer;}
.mention-menu-item.active,.mention-menu-item:hover{background:var(--accent-weak);}
.emoji-trigger{
  position:absolute;right:7px;bottom:7px;border:none;background:none;color:var(--muted);
  cursor:pointer;padding:4px;border-radius:6px;display:grid;place-items:center;
}
.emoji-trigger:hover{background:var(--surface-2);color:var(--ink);}
.emoji-popover{
  position:absolute;right:0;bottom:100%;margin-bottom:4px;
  border-radius:10px;box-shadow:var(--shadow);overflow:hidden;z-index:20;line-height:1;
}
.emoji-popover-loading{
  width:300px;height:360px;display:grid;place-items:center;
  background:var(--surface);border:1px solid var(--line);border-radius:10px;
  font-size:12.5px;color:var(--muted);
}

/* ---- attachments ---- */
.attachment-list{display:flex;flex-direction:column;gap:6px;}
.attachment-row{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid var(--line);border-radius:9px;background:var(--surface-2);}
.attachment-ic{color:var(--muted);flex:none;}
.attachment-info{flex:1;min-width:0;display:flex;flex-direction:column;}
.attachment-name{font-size:12.5px;font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.attachment-meta{font-size:11px;color:var(--muted);}
.attachment-drop{
  display:flex;align-items:center;justify-content:center;gap:8px;padding:16px;
  border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-size:12.5px;font-weight:500;
  cursor:pointer;transition:all .14s;
}
.attachment-drop:hover,.attachment-drop.drop{border-color:var(--accent);color:var(--accent);background:var(--accent-weak);}

/* ---- modal ---- */
.overlay{
  position:fixed;inset:0;background:rgba(22,28,45,.42);backdrop-filter:blur(2px);
  display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;z-index:50;
  animation:fade .16s ease;overflow-y:auto;
}
@keyframes fade{from{opacity:0;}to{opacity:1;}}
.modal{
  width:100%;max-width:520px;background:var(--surface);border-radius:16px;
  box-shadow:var(--shadow-lg);animation:pop .18s cubic-bezier(.2,.8,.3,1);overflow:hidden;
}
.modal.narrow{max-width:420px;}
@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.98);}to{opacity:1;transform:none;}}
.modal-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--line);}
.modal-head h2{font-family:var(--font-display);font-size:16px;font-weight:600;margin:0;letter-spacing:-.01em;}
.modal-body{padding:16px 18px;display:flex;flex-direction:column;gap:13px;}
.field{display:flex;flex-direction:column;gap:6px;}
.field-lbl{font-size:11.5px;font-weight:600;color:var(--ink-2);text-transform:uppercase;letter-spacing:.03em;}
.in{
  font-family:inherit;font-size:13.5px;color:var(--ink);
  border:1px solid var(--line);background:var(--surface-2);border-radius:9px;padding:9px 11px;width:100%;transition:all .14s;
}
.in:focus{outline:none;border-color:var(--accent);background:#fff;box-shadow:0 0 0 3px var(--accent-weak);}
.in:disabled{opacity:.65;cursor:not-allowed;}
.readonly-value{font-size:13.5px;color:var(--ink-2);padding:9px 11px;border:1px solid var(--line-2);border-radius:9px;background:var(--surface-2);}
.link-input-row{display:flex;align-items:stretch;gap:8px;}
.link-input-row .in{flex:1;min-width:0;}
.link-open-btn{
  display:inline-flex;align-items:center;justify-content:center;flex:none;
  color:var(--accent);background:var(--accent-weak);border-radius:9px;padding:0 12px;
  transition:background .12s,color .12s;
}
.link-open-btn:hover{background:var(--accent);color:#fff;}
.area{resize:vertical;min-height:64px;line-height:1.45;}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:11px;}
.err{color:var(--p-urgent);font-size:12px;margin:-6px 0 0;font-weight:500;}
.modal-foot{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-top:1px solid var(--line);background:var(--surface-2);}
.foot-right{display:flex;gap:9px;margin-left:auto;}
.spin{animation:spin .7s linear infinite;}

/* ---- bulk import ---- */
.modal.wide{max-width:860px;}
.import-steps{display:flex;gap:6px;padding:10px 18px 0;}
.import-step{font-size:11.5px;font-weight:600;color:var(--muted);padding:5px 10px;border-radius:20px;background:var(--surface-2);border:1px solid var(--line);}
.import-step.active{color:var(--accent);background:var(--accent-weak);border-color:var(--accent-weak);}
.import-step.past{color:var(--ink-2);}
.import-drop{
  display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;
  padding:36px 18px;border:1.5px dashed var(--line);border-radius:12px;color:var(--ink-2);
  cursor:pointer;transition:all .14s;
}
.import-drop:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-weak);}
.import-drop .hint{color:var(--muted);}
.import-map-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:11px;}
.import-value-map{display:flex;flex-direction:column;gap:7px;max-height:180px;overflow-y:auto;}
.import-value-row{display:grid;grid-template-columns:1fr 180px;align-items:center;gap:10px;font-size:12.5px;color:var(--ink);}
.import-preview-list{display:flex;flex-direction:column;gap:2px;max-height:360px;overflow-y:auto;border:1px solid var(--line);border-radius:10px;padding:6px;}
.import-preview-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;font-size:12.5px;}
.import-preview-row.has-err{background:#FDECED;}
.import-preview-row .warn-ic{color:var(--p-urgent);flex:none;}
.import-preview-row .ok-ic{color:#22c55e;flex:none;}
.import-row-type{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:var(--muted);flex:none;}
.import-row-title{font-weight:500;color:var(--ink);}
.import-row-err{color:var(--p-urgent);font-size:11.5px;font-weight:500;}
.Toastify__toast{
  font-family:var(--font-body);font-size:13.5px;border-radius:11px;
  box-shadow:var(--shadow-lg);padding:12px 14px;
}
.Toastify__toast--success{background:var(--surface);color:var(--ink);border:1px solid #BEEACB;}
.Toastify__toast--error{background:var(--surface);color:var(--ink);border:1px solid #F7C9CB;}
.Toastify__progress-bar--success{background:#22c55e;}
.Toastify__progress-bar--error{background:var(--p-urgent);}

/* ---- team / users admin ---- */
.hint{color:var(--muted);font-size:11.5px;line-height:1.5;margin:-4px 0 0;}
.member-list{list-style:none;margin:2px 0 0;padding:0;display:flex;flex-direction:column;gap:2px;min-height:320px;overflow-y:auto;}
.member-row{display:flex;align-items:center;gap:10px;padding:8px 6px;border-radius:9px;transition:background .12s;}
.member-row:hover{background:var(--surface-2);}
.member-block{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1;}
.member-name{font-weight:550;font-size:13.5px;}
.member-email{font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.member-email.muted{font-style:italic;opacity:.75;}
.empty-row{color:var(--muted);font-size:13px;padding:10px 6px;font-style:italic;}
.btn-lbl{}

/* ---- project / workflow settings ---- */
.settings-h{font-family:var(--font-display);font-size:20px;font-weight:600;margin:0 0 4px;}
.settings-h3{font-family:var(--font-display);font-size:14px;font-weight:600;margin:0 0 4px;}
.settings-section{margin-top:22px;padding-top:18px;border-top:1px solid var(--line);}
.settings-list{list-style:none;margin:8px 0;padding:0;display:flex;flex-direction:column;gap:2px;}
.settings-row{display:flex;align-items:center;gap:10px;padding:7px 4px;border-radius:8px;}
.settings-row:hover{background:var(--surface-2);}
.settings-row.draggable{cursor:grab;}
.settings-row.is-dragging{opacity:.4;}
.settings-row-name{font-size:13.5px;font-weight:550;}
.drag-handle{display:flex;align-items:center;color:#AEB6C4;flex:none;}
.settings-add-row{display:flex;gap:8px;align-items:center;margin-top:8px;}
.settings-add-row .in{flex:1;}
.status-cat-badge{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:3px 7px;border-radius:6px;flex:none;}
.status-cat-todo{background:#EEF0F5;color:#586074;}
.status-cat-in_progress{background:#EFF3FE;color:#3E77E0;}
.status-cat-done{background:#EAFBF0;color:#15803D;}

@media (max-width:640px){
  .menu-toggle{display:flex;}
  .sidebar{
    position:fixed;top:0;left:0;z-index:50;
    box-shadow:var(--shadow-lg);
    transform:translateX(-100%);transition:transform .2s ease;
  }
  .sidebar.open{transform:translateX(0);}
  .sidebar-close{
    display:grid;place-items:center;align-self:flex-end;
    border:none;background:transparent;color:var(--muted);cursor:pointer;
    padding:6px;border-radius:7px;margin-bottom:6px;
  }
  .sidebar-close:hover{background:var(--surface-2);color:var(--ink);}
  .sidebar-overlay{
    display:block;position:fixed;inset:0;background:rgba(20,28,48,.35);z-index:40;
  }
  .brand-sub{display:none;}
  .searchbox input{width:130px;}
  .btn-lbl{display:none;}
  .row2{grid-template-columns:1fr;}
  .board{padding:14px 12px 18px;}
  .notif-panel{
    position:fixed;top:60px;left:10px;right:10px;margin-top:0;
    width:auto;max-width:none;max-height:calc(100vh - 76px);
  }
}
@media (prefers-reduced-motion:reduce){
  *{animation:none!important;transition:none!important;}
}
`;
