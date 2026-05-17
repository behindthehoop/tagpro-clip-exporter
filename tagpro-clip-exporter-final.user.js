// ==UserScript==
// @name         TagPro Replay Clip Exporter
// @namespace    https://tagpro.koalabeast.com/
// @version      4.11
// @description  Export clips from TagPro replays as video files
// @author       FLYMOLO (feat. Claude)
// @match        https://tagpro.koalabeast.com/game?replay=*
// @match        https://static.koalabeast.com/game?replay=*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        FPS: 60,
        POLL_INTERVAL_MS: 100,
        HOTKEY: '/',
        MIN_RECORD_MS: 2000,
        MIN_FILE_SIZE_BYTES: 50_000,
        SEEK_TOLERANCE_SEC: 5,
        SEEK_TIMEOUT_MS: 5000,
        WHOLE_MAP_ZOOM: 1.6,
        PLAYER_POLL_INTERVAL: 500,
        PLAYER_POLL_MAX: 20,
        CAP_BUFFER_BEFORE_MS: 5000,
        CAP_BUFFER_AFTER_MS: 3500,
    };

    const STYLES = `
        #clipExporterPanel{position:fixed;top:10px;right:10px;width:240px;background:rgba(30,30,30,.93);border:1px solid rgba(255,255,255,.15);border-radius:8px;color:#E0E0E0;font-family:'Segoe UI',Tahoma,sans-serif;font-size:13px;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,.5);backdrop-filter:blur(8px);overflow:hidden}
        .clip-header{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(255,255,255,.05);border-bottom:1px solid rgba(255,255,255,.1)}
        .clip-title{font-weight:600;font-size:13px}
        #clipMinimizeBtn{background:none;border:none;color:#999;font-size:18px;cursor:pointer;padding:0 4px;line-height:1}
        #clipMinimizeBtn:hover{color:#fff}
        #clipBody{padding:8px 10px}
        .clip-format-note{font-size:10px;padding:3px 6px;margin-bottom:6px;border-radius:3px;background:rgba(255,255,255,.05)}
        .clip-row{display:flex;align-items:center;gap:4px;margin-bottom:6px}
        .clip-row label{width:34px;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#AAA;flex-shrink:0}
        .clip-row input[type="text"]{width:60px;flex:0 0 60px;padding:4px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:4px;color:#fff;font-family:Consolas,Monaco,monospace;font-size:14px;text-align:center}
        .clip-row input[type="text"]:focus{outline:none;border-color:rgba(100,180,255,.5)}
        .clip-now-btn{padding:4px 6px;font-size:10px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:3px;color:#bbb;cursor:pointer;flex-shrink:0}
        .clip-now-btn:hover{background:rgba(255,255,255,.18);color:#fff}
        .clip-settings{gap:6px}
        .clip-settings select, .clip-view-row select{flex:1;padding:3px 4px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:4px;color:#ddd;font-size:11px;cursor:pointer;appearance:auto}
        .clip-settings select:focus, .clip-view-row select:focus{outline:none;border-color:rgba(100,180,255,.5)}
        .clip-view-row{gap:4px}
        .clip-view-row select:disabled{opacity:.4;cursor:not-allowed}
        .clip-hint{font-size:10px;color:#777;margin-bottom:6px}
        .clip-hint kbd, .clip-help kbd{background:rgba(255,255,255,.1);padding:1px 4px;border-radius:2px;font-family:monospace;font-size:11px}
        .clip-actions button{padding:6px 10px;border:1px solid rgba(255,255,255,.15);border-radius:4px;color:#ddd;cursor:pointer;font-size:12px;white-space:nowrap}
        #clipExportBtn{flex:1;background:rgba(229,57,53,.3);border-color:rgba(229,57,53,.5);font-weight:600;font-size:13px}
        #clipExportBtn:hover:not(:disabled){background:rgba(229,57,53,.5)}
        #clipExportBtn:disabled{opacity:.4;cursor:not-allowed}
        #clipCancelBtn{background:rgba(255,152,0,.3);border-color:rgba(255,152,0,.5)}
        #clipCancelBtn:hover{background:rgba(255,152,0,.5)}
        .clip-status{font-size:11px;padding:4px 0 2px;min-height:1.4em;line-height:1.4;word-break:break-word}
        .clip-help{margin-top:4px;font-size:10px;color:#888}
        .clip-help summary{cursor:pointer;user-select:none}
        .clip-help summary:hover{color:#ccc}
        .clip-help ol{margin:4px 0 0;padding-left:16px}
        .clip-help li{margin-bottom:2px;line-height:1.4}
        .clip-help p{margin:4px 0 0}
        .clip-autodetect{margin-bottom:6px}
        .clip-autodetect summary{cursor:pointer;user-select:none;font-size:11px;font-weight:600;color:#90CAF9;padding:3px 0}
        .clip-autodetect summary:hover{color:#fff}
        .clip-autodetect-body{padding:4px 0}
        #clipFindCapsBtn{width:100%;padding:5px 8px;background:rgba(100,180,255,.15);border:1px solid rgba(100,180,255,.3);border-radius:4px;color:#90CAF9;cursor:pointer;font-size:11px;font-weight:600;margin-bottom:4px}
        #clipFindCapsBtn:hover:not(:disabled){background:rgba(100,180,255,.3)}
        #clipFindCapsBtn:disabled{opacity:.4;cursor:not-allowed}
        #clipCapSelect{width:100%;padding:4px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:4px;color:#ddd;font-size:11px;cursor:pointer;appearance:auto}
        #clipCapSelect:disabled{opacity:.4;cursor:not-allowed}
    `;

    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;
    let pollTimer = null;
    let copyFrameId = null;
    let nextHotkeyTarget = 'start';
    let savedZoom = null;
    let savedFollowPlayer = null;
    let savedPlayerId = null;
    let activeExtension = 'mp4';
    let cachedReplayEvents = null;
    let gameStartClockSec = null;

    // ===================== UTILITIES =====================

    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    function getReplayId() { return new URLSearchParams(window.location.search).get('replay') || null; }

    // ===================== TIME =====================

    function parseTime(str) {
        if (!str || !str.trim()) return null;
        const parts = str.trim().split(':');
        if (parts.length === 2) {
            const m = parseInt(parts[0], 10), s = parseInt(parts[1], 10);
            if (!isNaN(m) && !isNaN(s) && s >= 0 && s < 60 && m >= 0) return m * 60 + s;
        }
        if (parts.length === 1) {
            const n = parseInt(parts[0], 10);
            if (!isNaN(n) && n >= 0) return n;
        }
        return null;
    }

    function formatTime(sec) {
        return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    }

    // The game clock counts DOWN from the start (e.g. 12:00). The slider
    // counts UP from 0ms. To convert between them we need the game clock
    // value at slider=0, computed once from any (clock, slider) pair.
    // This handles mercy rule games where replay < full game duration.
    function getGameStartClock() {
        if (gameStartClockSec !== null) return gameStartClockSec;
        const clock = getCurrentReplayTime();
        const slider = document.getElementById('replaySeekBar');
        if (clock === null || !slider) return null;
        gameStartClockSec = clock + (parseFloat(slider.value) / 1000);
        return gameStartClockSec;
    }

    function replayMsToClockSec(replayMs) {
        const start = getGameStartClock();
        return start !== null ? start - (replayMs / 1000) : null;
    }

    function clockSecToSliderMs(clockSec) {
        const start = getGameStartClock();
        return start !== null ? (start - clockSec) * 1000 : null;
    }

    function normalizeTimeInput(input) {
        const t = parseTime(input.value);
        if (t !== null) input.value = formatTime(t);
    }

    // ===================== CLOCK =====================

    function getCurrentReplayTime() {
        const clock = document.getElementById('replayClock');
        if (!clock) return null;
        return parseTime(clock.textContent);
    }

    // ===================== SEEKING =====================

    function seekToTime(targetClockSec) {
        const slider = document.getElementById('replaySeekBar');
        if (!slider || typeof $ === 'undefined') return false;
        const sliderMax = parseFloat(slider.max);
        const targetMs = clockSecToSliderMs(targetClockSec);
        if (targetMs === null) return false;
        const clampedMs = Math.max(0, Math.min(sliderMax, Math.round(targetMs)));
        console.log(`[Clip Exporter] Seek: target=${formatTime(targetClockSec)} → ${clampedMs}ms/${sliderMax}ms`);
        $('#replaySeekBar').val(clampedMs).trigger('mouseup');
        return true;
    }

    function waitForClockNear(targetSec, toleranceSec, timeoutMs) {
        return new Promise((resolve) => {
            const start = Date.now();
            const check = setInterval(() => {
                const now = getCurrentReplayTime();
                if (now !== null && Math.abs(now - targetSec) <= toleranceSec) { clearInterval(check); resolve(true); }
                if (Date.now() - start > timeoutMs) { clearInterval(check); resolve(false); }
            }, CONFIG.POLL_INTERVAL_MS);
        });
    }

    // ===================== KEYBOARD =====================

    function simulateKey(key, code, keyCode) {
        const opts = { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true,
            shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };
        document.dispatchEvent(new KeyboardEvent('keydown', opts));
        setTimeout(() => document.dispatchEvent(new KeyboardEvent('keyup', opts)), 50);
    }
    function pressSpace() { simulateKey(' ', 'Space', 32); }

    // ===================== FORMAT =====================

    function detectBestFormat() {
        for (const mt of ['video/mp4;codecs=avc1', 'video/mp4;codecs=avc1.42E01E', 'video/mp4'])
            if (MediaRecorder.isTypeSupported(mt)) return { mimeType: mt, extension: 'mp4' };
        for (const mt of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'])
            if (MediaRecorder.isTypeSupported(mt)) return { mimeType: mt, extension: 'webm' };
        return null;
    }

    // ===================== SETTINGS =====================

    function getSelectedBitrate() { return parseInt(document.querySelector('#clipBitrate')?.value, 10) || 12_000_000; }
    function getSelectedResolution() { return document.querySelector('#clipResolution')?.value || '1080'; }

    // ===================== REPLAY DATA PARSER =====================

    async function fetchReplayEvents(replayId) {
        const response = await fetch(`https://tagpro.koalabeast.com/replays/gameFile?key=${replayId}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return parseReplayData(await response.text());
    }

    function parseReplayData(raw) {
        const lines = raw.trim().split('\n');
        const caps = [], grabs = [];
        let players = {}, gameTimeSec = null;

        for (const line of lines) {
            try {
                const [timeMs, type, data] = JSON.parse(line);
                if (line.includes('recorder-metadata')) {
                    if (data?.players) for (const p of data.players) players[p.id] = { name: p.displayName || p.name || `Player ${p.id}`, team: p.team };
                    if (data?.duration) gameTimeSec = Math.ceil(data.duration / 1000);
                }
                if (type === 'p' && Array.isArray(data)) {
                    for (const diff of data) {
                        if (diff.hasOwnProperty('s-grabs')) grabs.push({ timeMs, playerId: diff.id });
                        if (diff.hasOwnProperty('s-captures') && !diff.hasOwnProperty('s-grabs')) caps.push({ timeMs, playerId: diff.id });
                    }
                }
            } catch { /* skip malformed lines */ }
        }

        const highlights = caps.map(cap => {
            const grab = grabs.filter(g => g.playerId === cap.playerId && g.timeMs < cap.timeMs).sort((a, b) => b.timeMs - a.timeMs)[0];
            return {
                playerId: cap.playerId,
                playerName: players[cap.playerId]?.name || `Player ${cap.playerId}`,
                playerTeam: players[cap.playerId]?.team,
                grabMs: grab ? grab.timeMs : cap.timeMs - 5000,
                capMs: cap.timeMs,
            };
        });

        return { highlights, players, gameTimeSec };
    }

    // ===================== AUTO-DETECT UI =====================

    async function findCaps() {
        const replayId = getReplayId();
        if (!replayId) { updateStatus('No replay ID in URL', 'error'); return; }

        const btn = document.querySelector('#clipFindCapsBtn');
        const sel = document.querySelector('#clipCapSelect');
        btn.disabled = true;
        btn.textContent = 'Searching...';
        updateStatus('Fetching replay data...', 'info');

        try {
            const data = await fetchReplayEvents(replayId);
            cachedReplayEvents = data;

            if (data.highlights.length === 0) {
                updateStatus('No flag captures found in this replay', 'warn');
                btn.textContent = '🔍 Find Caps'; btn.disabled = false;
                return;
            }

            sel.innerHTML = '<option value="">Select a cap...</option>';
            data.highlights.forEach((h, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                const clockSec = replayMsToClockSec(h.capMs);
                const timeLabel = clockSec !== null
                    ? formatTime(Math.max(0, Math.round(clockSec)))
                    : `${(h.capMs / 1000).toFixed(0)}s in`;
                opt.textContent = `${h.playerTeam === 1 ? '🔴' : '🔵'} ${h.playerName} cap @ ${timeLabel}`;
                sel.appendChild(opt);
            });

            sel.disabled = false;
            btn.textContent = `🔍 ${data.highlights.length} cap${data.highlights.length > 1 ? 's' : ''} found`;
            updateStatus(`Found ${data.highlights.length} cap${data.highlights.length > 1 ? 's' : ''}. Pick one to auto-fill times.`, 'success');
        } catch (e) {
            console.error('[Clip Exporter] Failed to fetch replay data:', e);
            updateStatus(`Failed to fetch replay data: ${e.message}`, 'error');
            btn.textContent = '🔍 Find Caps';
        }
        btn.disabled = false;
    }

    function onCapSelected(e) {
        const idx = parseInt(e.target.value, 10);
        if (isNaN(idx) || !cachedReplayEvents) return;
        const h = cachedReplayEvents.highlights[idx];
        if (!h) return;

        const fromClock = replayMsToClockSec(Math.max(0, h.grabMs - CONFIG.CAP_BUFFER_BEFORE_MS));
        const toClock = replayMsToClockSec(h.capMs + CONFIG.CAP_BUFFER_AFTER_MS);
        if (fromClock === null || toClock === null) { updateStatus('Can\'t convert times — is the replay loaded?', 'error'); return; }

        const fromClockSec = Math.max(0, Math.round(fromClock));
        const toClockSec = Math.max(0, Math.round(toClock));

        document.querySelector('#clipStartTime').value = formatTime(fromClockSec);
        document.querySelector('#clipEndTime').value = formatTime(toClockSec);

        document.querySelector('#clipViewMode').value = 'pov';
        const playerSel = document.querySelector('#clipPlayerSelect');
        playerSel.disabled = false;
        populatePlayerList();

        let matched = false;
        for (let i = 0; i < playerSel.options.length; i++) {
            if (playerSel.options[i].value === String(h.playerId)) { playerSel.value = String(h.playerId); matched = true; break; }
        }

        const emoji = h.playerTeam === 1 ? '🔴' : '🔵';
        updateStatus(matched
            ? `${emoji} ${h.playerName} — ${formatTime(fromClockSec)} → ${formatTime(toClockSec)} (POV set)`
            : `Times set: ${formatTime(fromClockSec)} → ${formatTime(toClockSec)} (select player manually)`,
            matched ? 'success' : 'info');
    }

    // ===================== RECORDER =====================

    function startRecording() {
        const gameCanvas = document.querySelector('#viewport');
        if (!gameCanvas) { updateStatus('Error: No canvas found', 'error'); return false; }
        const format = detectBestFormat();
        if (!format) { updateStatus('Error: No recording support in this browser', 'error'); return false; }

        activeExtension = format.extension;
        const bitrate = getSelectedBitrate();
        const resSetting = getSelectedResolution();

        let w, h;
        if (resSetting === 'native') { w = gameCanvas.width; h = gameCanvas.height; }
        else { const scale = parseInt(resSetting, 10) / gameCanvas.height; w = Math.round(gameCanvas.width * scale); h = parseInt(resSetting, 10); }

        // Copy canvas prevents ghosting from WebGL's preserveDrawingBuffer:false.
        // globalCompositeOperation 'copy' replaces pixels instead of alpha-blending.
        const recordCanvas = document.createElement('canvas');
        recordCanvas.width = w; recordCanvas.height = h;
        const ctx = recordCanvas.getContext('2d');
        ctx.globalCompositeOperation = 'copy';

        function copyFrame() { ctx.drawImage(gameCanvas, 0, 0, w, h); copyFrameId = requestAnimationFrame(copyFrame); }
        copyFrame();

        const stream = recordCanvas.captureStream(CONFIG.FPS);
        recordedChunks = [];

        try { mediaRecorder = new MediaRecorder(stream, { mimeType: format.mimeType, videoBitsPerSecond: bitrate }); }
        catch (e) { updateStatus(`Error: ${e.message}`, 'error'); return false; }

        mediaRecorder.ondataavailable = (e) => { if (e.data?.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            if (copyFrameId) { cancelAnimationFrame(copyFrameId); copyFrameId = null; }
            restoreViewMode();
            const blob = new Blob(recordedChunks, { type: format.mimeType });
            if (blob.size < CONFIG.MIN_FILE_SIZE_BYTES) { updateStatus(`⚠ Only ${(blob.size/1024).toFixed(1)} KB — was the replay playing?`, 'warn'); }
            else { updateStatus(`Done! ${activeExtension.toUpperCase()} ${w}x${h} (${(blob.size/1024/1024).toFixed(1)} MB)`, 'success'); }
            downloadBlob(blob);
            isRecording = false;
            updateUI();
        };

        mediaRecorder.start();
        isRecording = true;
        console.log(`[Clip Exporter] Recording: ${format.mimeType}, ${(bitrate/1e6).toFixed(0)} Mbps, ${w}x${h}`);
        return true;
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        if (copyFrameId) { cancelAnimationFrame(copyFrameId); copyFrameId = null; }
        isRecording = false;
    }

    // ===================== DOWNLOAD =====================

    function downloadBlob(blob) {
        const replayId = getReplayId() || 'clip';
        const s = (document.querySelector('#clipStartTime')?.value || '').replace(':', 'm') + 's';
        const e = (document.querySelector('#clipEndTime')?.value || '').replace(':', 'm') + 's';
        const range = s && e ? `_${s}-${e}` : '';
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: `tagpro_${replayId}${range}.${activeExtension}`, style: 'display:none' });
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
    }

    // ===================== EXPORT =====================

    async function exportClip() {
        if (isRecording) return;
        const startInput = document.querySelector('#clipStartTime'), endInput = document.querySelector('#clipEndTime');
        let fromSec = parseTime(startInput.value), toSec = parseTime(endInput.value);

        if (fromSec === null) { updateStatus('Enter a valid FROM time (e.g. 5:18)', 'error'); return; }
        if (toSec === null) { updateStatus('Enter a valid TO time (e.g. 4:50)', 'error'); return; }
        if (fromSec === toSec) { updateStatus('FROM and TO are the same', 'error'); return; }

        const viewMode = document.querySelector('#clipViewMode')?.value || 'whole';
        const playerId = document.querySelector('#clipPlayerSelect')?.value;
        if (viewMode === 'pov' && !playerId) { updateStatus('Select a player for POV', 'error'); return; }

        if (fromSec < toSec) { [fromSec, toSec] = [toSec, fromSec]; startInput.value = formatTime(fromSec); endInput.value = formatTime(toSec); }
        const clipDurationSec = fromSec - toSec;

        // Step 1: Seek to start time
        updateStatus(`Seeking to ${formatTime(fromSec)}...`, 'info');
        if (!seekToTime(fromSec)) { updateStatus('Seek failed — is the replay loaded?', 'error'); return; }

        // Step 2: Let seek settle
        await delay(1500);

        // Step 3: Apply camera, then play, then record
        try {
            applyViewMode(viewMode, playerId);
        } catch (e) {
            console.warn('[Clip Exporter] applyViewMode error:', e.message);
        }
        await delay(500);

        ensurePlaying();
        await delay(500);

        if (!startRecording()) return;
        updateUI();
        const recStart = Date.now();

        pollTimer = setInterval(() => {
            const now = getCurrentReplayTime(), elapsed = Date.now() - recStart;
            const progress = Math.min(100, Math.round((elapsed / (clipDurationSec * 1000)) * 100));
            const remaining = Math.max(0, Math.ceil(clipDurationSec - elapsed / 1000));

            if (now !== null) {
                const warmup = Math.max(0, Math.ceil((CONFIG.MIN_RECORD_MS - elapsed) / 1000));
                updateStatus(warmup > 0
                    ? `⏺ REC — starting in ${warmup}s...`
                    : `⏺ REC ${progress}% — ${formatTime(now)} → ${formatTime(toSec)} (${remaining}s left)`, 'recording');
            } else { updateStatus(`⏺ REC ${Math.floor(elapsed/1000)}s — clock not readable`, 'recording'); }

            if (elapsed < CONFIG.MIN_RECORD_MS) return;
            if (now !== null && now <= toSec) { stopRecording(); pressSpace(); updateUI(); }
        }, CONFIG.POLL_INTERVAL_MS);

        setTimeout(() => { if (isRecording) { updateStatus('Safety timeout.', 'warn'); stopRecording(); updateUI(); } }, (clipDurationSec + 15) * 1000);
    }

    // ===================== PLAYBACK & CAMERA =====================

    function ensurePlaying() {
        const icon = document.querySelector('.fa-play');
        if (icon) (icon.closest('button') || icon.parentElement || icon).click();
    }
    function ensurePaused() {
        const icon = document.querySelector('.fa-pause');
        if (icon) (icon.closest('button') || icon.parentElement || icon).click();
    }

    function applyViewMode(mode, playerId) {
        savedZoom = tagpro.zoom;
        savedFollowPlayer = tagpro.viewport?.followPlayer;
        savedPlayerId = tagpro.playerId;
        if (mode === 'pov' && playerId) {
            tagpro.viewport.followPlayer = true;
            tagpro.playerId = Number(playerId);
            tagpro.zoom = 1;
        } else {
            simulateKey('c', 'KeyC', 67);
            tagpro.zoom = CONFIG.WHOLE_MAP_ZOOM;
        }
    }

    function restoreViewMode() {
        if (savedZoom !== null) { tagpro.zoom = savedZoom; savedZoom = null; }
        if (savedFollowPlayer !== null && tagpro.viewport) { tagpro.viewport.followPlayer = savedFollowPlayer; savedFollowPlayer = null; }
        if (savedPlayerId !== null) { tagpro.playerId = savedPlayerId; savedPlayerId = null; }
    }

    // ===================== STATUS & UI HELPERS =====================

    function updateStatus(msg, type = 'info') {
        const el = document.querySelector('#clipExporterStatus');
        if (!el) return;
        el.textContent = msg;
        el.style.color = { info:'#90CAF9', success:'#A5D6A7', error:'#EF9A9A', warn:'#FFE082', recording:'#EF5350' }[type] || '#90CAF9';
    }

    function updateUI() {
        const exp = document.querySelector('#clipExportBtn'), can = document.querySelector('#clipCancelBtn');
        if (exp) exp.disabled = isRecording;
        if (can) can.style.display = isRecording ? 'inline-block' : 'none';
    }

    function grabTimeInto(which) {
        const t = getCurrentReplayTime();
        if (t === null) { updateStatus('Can\'t read clock — is the replay loaded?', 'warn'); return; }
        document.querySelector(which === 'start' ? '#clipStartTime' : '#clipEndTime').value = formatTime(t);
        updateStatus(`${which === 'start' ? 'FROM' : 'TO'} → ${formatTime(t)}`, 'info');
    }

    function populatePlayerList() {
        const sel = document.querySelector('#clipPlayerSelect');
        if (!sel || !window.tagpro?.players) return false;
        const players = Object.entries(tagpro.players).map(([id, p]) => ({ id, name: p.name, team: p.team })).sort((a, b) => a.team - b.team || a.name.localeCompare(b.name));
        if (players.length === 0) return false;
        sel.innerHTML = '<option value="">Select player...</option>';
        for (const p of players) { const opt = document.createElement('option'); opt.value = p.id; opt.textContent = `${p.team === 1 ? '🔴' : '🔵'} ${p.name}`; sel.appendChild(opt); }
        return true;
    }

    function pollForPlayers() {
        let attempts = 0;
        const check = setInterval(() => { attempts++; if (populatePlayerList() || attempts >= CONFIG.PLAYER_POLL_MAX) clearInterval(check); }, CONFIG.PLAYER_POLL_INTERVAL);
    }

    // ===================== UI =====================

    function createUI() {
        if (document.getElementById('clipExporterPanel')) return;
        const panel = document.createElement('div');
        panel.id = 'clipExporterPanel';
        const fmt = detectBestFormat()?.extension === 'mp4' ? '✓ MP4' : '⚠ WebM';

        panel.innerHTML = `
            <div class="clip-header"><span class="clip-title">🎬 Clip Exporter</span><button id="clipMinimizeBtn" title="Minimize">−</button></div>
            <div id="clipBody">
                <div class="clip-format-note">${fmt} · Video only (no audio)</div>
                <details class="clip-autodetect"><summary>🔍 Auto-detect flag captures</summary><div class="clip-autodetect-body">
                    <button id="clipFindCapsBtn">🔍 Find Caps</button>
                    <select id="clipCapSelect" disabled><option value="">Click "Find Caps" first...</option></select>
                </div></details>
                <div class="clip-row"><label>FROM</label><input type="text" id="clipStartTime" placeholder="5:18"><button class="clip-now-btn" id="clipSetStart">Now</button></div>
                <div class="clip-row"><label>TO</label><input type="text" id="clipEndTime" placeholder="4:50"><button class="clip-now-btn" id="clipSetEnd">Now</button></div>
                <div class="clip-row clip-settings">
                    <select id="clipResolution" title="Output resolution"><option value="native">Native</option><option value="720">720p</option><option value="1080" selected>1080p</option></select>
                    <select id="clipBitrate" title="Video bitrate"><option value="8000000">8 Mbps</option><option value="12000000" selected>12 Mbps</option><option value="20000000">20 Mbps</option></select>
                </div>
                <div class="clip-row clip-view-row">
                    <select id="clipViewMode" title="Camera view"><option value="whole">Whole Map</option><option value="pov">POV</option></select>
                    <select id="clipPlayerSelect" title="Follow player" disabled><option value="">Select player...</option></select>
                </div>
                <div class="clip-hint">Press <kbd>/</kbd> to grab time (FROM ↔ TO)</div>
                <div class="clip-row clip-actions"><button id="clipExportBtn">⏺ Export Clip</button><button id="clipCancelBtn" style="display:none;">⏹ Cancel</button></div>
                <div id="clipExporterStatus" class="clip-status">Enter times manually or use auto-detect above.</div>
                <details class="clip-help"><summary>How to use</summary>
                    <ol><li>Use <strong>Find Caps</strong> to auto-detect flag captures, or enter times manually</li><li>Pick resolution & bitrate</li><li>Choose Whole Map or POV (follow a player)</li><li>Set replay speed to 1× before exporting</li><li>Click Export — seeks, records, downloads</li></ol>
                    <p><strong>Auto-detect:</strong> Fetches the replay data and finds every flag capture. Pick one to auto-fill the times and POV player.</p>
                    <p><strong>Resolution:</strong> Native = exact canvas size. 720p/1080p scale to standard heights. TagPro's art is ~1280×800 so 1080p is the sweet spot.</p>
                    <p><strong>Bitrate:</strong> 12 Mbps is great for most clips. Use 20+ for editing or re-encoding.</p>
                    <p><strong>POV:</strong> Switch to POV and pick a player to record their perspective. Whole Map shows the zoomed-out overview.</p>
                    <p><strong>Note:</strong> Clips are video only — no audio. Custom textures you have installed will appear in the clip.</p>
                </details>
            </div>`;

        document.body.appendChild(panel);
        injectStyles();

        document.querySelector('#clipExportBtn').addEventListener('click', exportClip);
        document.querySelector('#clipCancelBtn').addEventListener('click', () => { stopRecording(); updateUI(); updateStatus('Cancelled.', 'warn'); });
        document.querySelector('#clipSetStart').addEventListener('click', () => { grabTimeInto('start'); nextHotkeyTarget = 'end'; });
        document.querySelector('#clipSetEnd').addEventListener('click', () => { grabTimeInto('end'); nextHotkeyTarget = 'start'; });
        document.querySelector('#clipMinimizeBtn').addEventListener('click', () => { const b = document.querySelector('#clipBody'), btn = document.querySelector('#clipMinimizeBtn'), h = b.style.display === 'none'; b.style.display = h ? '' : 'none'; btn.textContent = h ? '−' : '+'; });
        document.querySelector('#clipFindCapsBtn').addEventListener('click', findCaps);
        document.querySelector('#clipCapSelect').addEventListener('change', onCapSelected);
        document.querySelector('#clipStartTime').addEventListener('blur', (e) => normalizeTimeInput(e.target));
        document.querySelector('#clipEndTime').addEventListener('blur', (e) => normalizeTimeInput(e.target));
        document.querySelector('#clipViewMode').addEventListener('change', (e) => { const sel = document.querySelector('#clipPlayerSelect'); sel.disabled = e.target.value !== 'pov'; if (!sel.disabled) populatePlayerList(); });

        pollForPlayers();
        document.addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || isRecording) return; if (e.key === CONFIG.HOTKEY) { e.preventDefault(); e.stopPropagation(); grabTimeInto(nextHotkeyTarget); nextHotkeyTarget = nextHotkeyTarget === 'start' ? 'end' : 'start'; } }, true);
    }

    function injectStyles() { const s = document.createElement('style'); s.textContent = STYLES; document.head.appendChild(s); }

    // ===================== INIT =====================

    function init() {
        if (document.getElementById('clipExporterPanel')) return;
        let n = 0;
        const check = setInterval(() => { n++; if (document.querySelector('#viewport')) { clearInterval(check); console.log('[Clip Exporter] v4.1'); createUI(); } else if (n >= 30) clearInterval(check); }, 1000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
