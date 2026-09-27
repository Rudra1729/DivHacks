/* ==========================================================================
   MISSION SUBMISSION: camera, GPS trail, and the real POST /submissions

   GPS sampling starts when the mission modal opens, so the trail the server
   wants builds up while the visitor frames the photo. The server's answer is
   shown in the modal, on Spidey-Bot, and gate by gate in the pipeline.

   Loaded before app.js. It uses PLACES, currentAuth, isLoggedIn,
   openLoginModal, setSpideyBotState, triggerThwipUnlock and refreshAccount
   from app.js, which are only called after the page has loaded.

   Add ?demo=1 to the page URL to show a switch that simulates a phone
   standing at the place, for demos away from Harlem. The server cannot tell
   a well-simulated trail from a real one, so it is hidden by default.
   ========================================================================== */

const DEMO_LOCATION_ALLOWED = new URLSearchParams(window.location.search).has('demo');

const submission = {
  placeId: null,
  photo: null,
  photoUrl: null,
  sampler: null,
  gpsError: null,
  camera: null,
  demo: false,
  submitting: false,
  statusTimer: null,
};

// Fixes in a row with an unchanged timestamp before the status calls GPS stuck.
const STUCK_GPS_REPEATS = 4;

const GATE_BY_LAYER = { sentinel: 'gate2', claim: 'gate2', agent: 'gate3', policy: 'gate4', xrpl: 'gate5', solana: 'gate5' };

/** Distance between two points in meters (haversine).

Args:
    a ({ latitude: number, longitude: number }): First point.
    b ({ lat: number, lng: number }): Second point, in the PLACES shape.

Returns:
    number: Meters apart.
*/
function metersBetween(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.latitude);
  const dLng = toRad(b.lng - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

/** Shorten a hash or address for display, like rP9x9K...5Xz1. */
function shortHash(value) {
  return value && value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value || '';
}

/** Explorer link for a real XRPL testnet payment, or nothing for a fake one.

Args:
    txHash (string): The payment's transaction hash.

Returns:
    Array<{text: string, href: string}>: One link, or empty in fake mode.
*/
function explorerLink(txHash) {
  if (!/^[0-9A-F]{64}$/i.test(txHash || '')) return [];
  return [{ text: 'See the payment on the XRPL testnet explorer', href: `https://testnet.xrpl.org/transactions/${txHash}` }];
}

function missionPlace() {
  return PLACES.find((p) => p.id === submission.placeId);
}

/** A trail like a real phone standing 10 to 40 m from the place for 18 seconds. Demo only. */
function simulatedTrail(place) {
  const metersPerDegLat = 111320;
  const metersPerDegLng = metersPerDegLat * Math.cos((place.lat * Math.PI) / 180);
  const angle = Math.random() * 2 * Math.PI;
  const radius = 10 + Math.random() * 30;
  const standLat = place.lat + (radius * Math.cos(angle)) / metersPerDegLat;
  const standLng = place.lng + (radius * Math.sin(angle)) / metersPerDegLng;
  const endAt = Date.now();
  return Array.from({ length: 10 }, (_, i) => ({
    latitude: standLat + ((Math.random() - 0.5) * 6) / metersPerDegLat,
    longitude: standLng + ((Math.random() - 0.5) * 6) / metersPerDegLng,
    accuracy: Math.round((6 + Math.random() * 19) * 10) / 10,
    timestamp: Math.round(endAt - 18000 + (i * 18000) / 9),
  }));
}

function currentTrail() {
  return submission.sampler ? submission.sampler.trail() : [];
}

function startLocationSampling() {
  stopLocationSampling();
  submission.gpsError = null;
  submission.sampler = WebPassCapture.startTrail({
    onReading: updateSubmissionStatus,
    onError: (error) => {
      submission.gpsError = error;
      updateSubmissionStatus();
    },
  });
  // The seconds covered keep growing between readings, so refresh on a timer too.
  submission.statusTimer = setInterval(updateSubmissionStatus, 1000);
}

function stopLocationSampling() {
  if (submission.sampler) submission.sampler.stop();
  submission.sampler = null;
  clearInterval(submission.statusTimer);
}

function setGpsStatus(kind, text) {
  const box = document.getElementById('gpsStatusBox');
  const label = document.getElementById('gpsStatusText');
  if (box) box.className = `gps-status-box ${kind}`;
  if (label) label.textContent = text;
}

/** Repaint the GPS status line and the submit button from the current state. */
function updateSubmissionStatus() {
  const place = missionPlace();
  if (!place) return;
  const trail = currentTrail();
  const need = WebPassCapture.TRAIL_REQUIREMENTS;

  if (submission.demo) {
    setGpsStatus('warning', `Demo location: a simulated phone standing near ${place.name}. Real visits use your GPS.`);
  } else if (submission.gpsError && trail.length === 0) {
    const refused = submission.gpsError.code === 1;
    setGpsStatus('error', refused
      ? 'Location access was refused. Allow it for this site to verify a visit.'
      : `Location unavailable: ${submission.gpsError.message || 'no GPS fix yet'}. Still trying...`);
  } else if (trail.length === 0) {
    setGpsStatus('pending', 'Waiting for GPS...');
  } else {
    const last = trail[trail.length - 1];
    const progress = WebPassCapture.trailProgress(trail);
    const where = `${formatDistance(metersBetween(last, place))} from ${place.name} (±${Math.round(last.accuracy)} m)`;
    const repeats = submission.sampler ? submission.sampler.repeatedReadings() : 0;
    if (!progress.ready && repeats >= STUCK_GPS_REPEATS) {
      setGpsStatus('error', `GPS is not updating: the same reading came back ${repeats} times. Turn off any location override, or step outside for a fresh fix.`);
    } else if (!progress.ready) {
      const seconds = Math.min(Math.floor(progress.spanMs / 1000), need.minSpanMs / 1000);
      setGpsStatus('pending', `Collecting GPS trail: ${Math.min(progress.readings, need.minReadings)}/${need.minReadings} readings, ${seconds}/${need.minSpanMs / 1000}s. ${where}`);
    } else if (metersBetween(last, place) > place.radius) {
      setGpsStatus('warning', `${where}. You need to be within ${place.radius} m for Sentinel to accept it.`);
    } else {
      setGpsStatus('success', `GPS trail ready: ${progress.readings} readings. ${where}`);
    }
  }
  updateSubmitButton();
}

function updateSubmitButton() {
  const button = document.getElementById('submitProofBtn');
  const label = document.getElementById('submitProofText');
  if (!button || !label) return;
  let text = 'THWIP! SUBMIT PROOF FOR VERIFICATION';
  let disabled = false;
  if (submission.submitting) {
    text = 'VERIFYING THROUGH ALL 5 GATES...';
    disabled = true;
  } else if (!submission.photo) {
    text = 'TAKE OR UPLOAD A PHOTO FIRST';
    disabled = true;
  } else if (!submission.demo && !WebPassCapture.trailProgress(currentTrail()).ready) {
    text = 'COLLECTING GPS TRAIL...';
    disabled = true;
  }
  button.disabled = disabled;
  label.textContent = text;
}

function setPhotoNote(text) {
  const note = document.getElementById('photoStatusNote');
  if (note) note.textContent = text;
}

function showCameraPreview(on) {
  document.getElementById('cameraPreview').style.display = on ? 'block' : 'none';
  document.getElementById('photoPreviewImg').style.display = on ? 'none' : 'block';
  document.getElementById('openCameraBtn').style.display = on ? 'none' : '';
  document.getElementById('snapPhotoBtn').style.display = on ? '' : 'none';
}

async function openSubmissionCamera() {
  const video = document.getElementById('cameraPreview');
  showCameraPreview(true);
  try {
    submission.camera = await WebPassCapture.openCamera(video);
    setPhotoNote('Frame the place, then snap.');
  } catch (error) {
    showCameraPreview(false);
    setPhotoNote(`Camera unavailable (${error.message}). Upload a photo instead.`);
  }
}

function closeSubmissionCamera() {
  if (submission.camera) {
    WebPassCapture.closeCamera(submission.camera);
    submission.camera = null;
  }
  const video = document.getElementById('cameraPreview');
  if (video) video.srcObject = null;
  showCameraPreview(false);
}

function setSubmissionPhoto(blob, note) {
  if (submission.photoUrl) URL.revokeObjectURL(submission.photoUrl);
  submission.photo = blob;
  submission.photoUrl = URL.createObjectURL(blob);
  const img = document.getElementById('photoPreviewImg');
  img.src = submission.photoUrl;
  img.classList.remove('placeholder');
  document.getElementById('openCameraBtn').innerHTML = '<i data-lucide="camera"></i> Retake';
  if (window.lucide) lucide.createIcons();
  setPhotoNote(note);
  updateSubmitButton();
}

async function snapSubmissionPhoto() {
  try {
    const blob = await WebPassCapture.capturePhoto(document.getElementById('cameraPreview'));
    closeSubmissionCamera();
    setSubmissionPhoto(blob, 'Photo taken with the camera.');
  } catch (error) {
    setPhotoNote(error.message);
  }
}

/** Show the server's answer in the modal.

Args:
    kind (string): 'ok', 'warn' or 'blocked', for colouring.
    title (string): Headline.
    lines (Array<string | {text: string, href: string}>): Details, one bullet
        each. An object becomes a link that opens in a new tab.
*/
function showSubmissionResult(kind, title, lines) {
  const box = document.getElementById('submissionResult');
  if (!box) return;
  box.className = `submission-result ${kind}`;
  box.replaceChildren();
  const heading = document.createElement('h4');
  heading.textContent = title;
  box.appendChild(heading);
  if (lines.length) {
    const list = document.createElement('ul');
    lines.forEach((line) => {
      const item = document.createElement('li');
      if (typeof line === 'string') {
        item.textContent = line;
      } else {
        const link = document.createElement('a');
        link.href = line.href;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = line.text;
        item.appendChild(link);
      }
      list.appendChild(item);
    });
    box.appendChild(list);
  }
  box.style.display = 'block';
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideSubmissionResult() {
  const box = document.getElementById('submissionResult');
  if (box) box.style.display = 'none';
}

/** Replay a decision's audit history on the 5-gate pipeline and in the log box.

Args:
    decisionId (string): The decision to show.
    placeName (string): For the log header.
*/
async function showDecisionInPipeline(decisionId, placeName) {
  const result = await WebPassApi.getDecision(decisionId);
  if (!result.ok || !result.body) return;
  const history = result.body.history || [];
  const gates = ['gate1', 'gate2', 'gate3', 'gate4', 'gate5'].map((id) => document.getElementById(id));
  gates.forEach((gate) => { if (gate) gate.className = 'gate-step'; });
  if (gates[0]) gates[0].className = 'gate-step active';

  addSimLog(`[LIVE] Decision ${decisionId} for ${placeName}: ${result.body.decision.status}`, 'info');
  history.forEach((entry) => {
    const gate = document.getElementById(GATE_BY_LAYER[entry.layer]);
    if (gate && !gate.classList.contains('blocked')) {
      gate.className = `gate-step ${entry.passed ? 'active' : 'blocked'}`;
    }
    addSimLog(`[${entry.layer.toUpperCase()}] ${entry.message}`, entry.passed ? 'success' : 'error');
  });
}

function handleSubmissionResult(place, result) {
  const body = result.body || {};
  if (!body.status) {
    const errors = body.errors && body.errors.length ? body.errors : [WebPassApi.errorMessage(result, 'The server gave an unexpected answer.')];
    showSubmissionResult('blocked', result.status === 0 ? 'Cannot reach the server' : 'Request refused', errors);
    setSpideyBotState('sentinel_blocked', `"${errors[0]}"`);
    return;
  }

  const reasons = body.reasons || [];
  const amount = body.proposal ? `${body.proposal.amount} RLUSD` : 'the reward';
  const stamp = body.stampTier ? `${body.stampTier} stamp #${body.stampSerial}` : 'soulbound stamp';

  if (body.status === 'OK' && !body.xrplTxHash) {
    triggerThwipUnlock(place.id);
    setSpideyBotState('approved', `"THWIP! ${place.name} verified. A ${stamp} was added to your passport!"`);
    showSubmissionResult('ok', 'THWIP! Visit verified', [
      `Minted a ${stamp} on Solana (${shortHash(body.solanaAssetAddress)})`,
      'Cultural visits earn the stamp only. Civic bounties also pay RLUSD.',
    ]);
  } else if (body.status === 'OK') {
    triggerThwipUnlock(place.id);
    setSpideyBotState('approved', `"THWIP! ${place.name} verified. ${amount} paid and a ${stamp} added to your passport!"`);
    showSubmissionResult('ok', 'THWIP! Visit verified', [
      `Paid ${amount} on XRPL (transaction ${shortHash(body.xrplTxHash)})`,
      ...explorerLink(body.xrplTxHash),
      `Minted a ${stamp} on Solana (${shortHash(body.solanaAssetAddress)})`,
      ...(body.proposal && body.proposal.reason ? [`Spidey-Bot: ${body.proposal.reason}`] : []),
    ]);
  } else if (body.status === 'STAMP_FAILED' || body.status === 'PAYMENT_UNCONFIRMED') {
    if (body.status === 'STAMP_FAILED') triggerThwipUnlock(place.id);
    setSpideyBotState('policy_blocked', `"${place.name} verified, but ${body.status === 'STAMP_FAILED' ? 'the stamp is queued for a retry' : 'the payment is still confirming'}."`);
    const paidTitle = body.xrplTxHash ? 'Paid, stamp queued for retry' : 'Verified, stamp queued for retry';
    showSubmissionResult('warn', body.status === 'STAMP_FAILED' ? paidTitle : 'Payment sent, waiting for the ledger', [
      ...(body.xrplTxHash ? [`Payment transaction ${shortHash(body.xrplTxHash)}`, ...explorerLink(body.xrplTxHash)] : []),
      ...reasons,
    ]);
  } else if (body.status === 'BLOCKED_SENTINEL') {
    setSpideyBotState('sentinel_blocked', `"SNAG! Sentinel blocked this visit: ${reasons[0] || 'verification failed'}"`);
    showSubmissionResult('blocked', 'SNAG! Sentinel blocked this visit', reasons);
  } else if (body.status === 'BLOCKED_POLICY') {
    setSpideyBotState('policy_blocked', `"GUARDRAIL HELD! ${reasons[0] || 'The policy engine refused the payout.'}"`);
    showSubmissionResult('blocked', 'GUARDRAIL HELD! Policy engine refused the payout', reasons);
  } else {
    setSpideyBotState('sentinel_blocked', `"LEDGER STOP! ${reasons[0] || 'The payment did not go through.'}"`);
    showSubmissionResult('blocked', 'The payment did not go through', reasons);
  }

  if (body.decisionId) showDecisionInPipeline(body.decisionId, place.name);
  if (typeof refreshAccount === 'function') refreshAccount();
}

async function submitMission(event) {
  event.preventDefault();
  if (submission.submitting) return;
  if (!isLoggedIn()) {
    openLoginModal();
    return;
  }
  const place = missionPlace();
  const trail = submission.demo ? simulatedTrail(place) : currentTrail();
  if (!submission.photo || (!submission.demo && !WebPassCapture.trailProgress(trail).ready)) {
    updateSubmitButton();
    return;
  }

  submission.submitting = true;
  updateSubmitButton();
  hideSubmissionResult();
  setSpideyBotState('ready', `"Checking your ${place.name} proof through all 5 gates..."`);

  const form = WebPassCapture.buildSubmission({
    placeId: place.id,
    photo: submission.photo,
    trail,
    xrplAddress: currentAuth.user.xrplAddress,
    solanaAddress: currentAuth.user.solanaAddress,
    caption: document.getElementById('captionInput').value.trim(),
  });
  const result = await WebPassApi.submitVisit(form);
  submission.submitting = false;
  updateSubmitButton();
  handleSubmissionResult(place, result);
}

/** Reset the mission modal for a place and start sampling GPS.

Args:
    placeId (string): The place being verified.
*/
function prepareSubmission(placeId) {
  closeSubmissionCamera();
  submission.placeId = placeId;
  submission.photo = null;
  submission.submitting = false;
  const place = missionPlace();

  const img = document.getElementById('photoPreviewImg');
  img.src = place ? place.image : '';
  img.classList.add('placeholder');
  document.getElementById('openCameraBtn').innerHTML = '<i data-lucide="camera"></i> Open Camera';
  if (window.lucide) lucide.createIcons();
  document.getElementById('photoFileInput').value = '';
  document.getElementById('captionInput').value = '';
  setPhotoNote('Take a photo at the place. Sentinel rejects photos it has seen before.');
  hideSubmissionResult();

  document.getElementById('demoLocationWrap').style.display = DEMO_LOCATION_ALLOWED ? 'flex' : 'none';
  submission.demo = DEMO_LOCATION_ALLOWED && document.getElementById('demoLocationToggle').checked;
  if (submission.demo) {
    stopLocationSampling();
  } else {
    startLocationSampling();
  }
  updateSubmissionStatus();
}

/** Stop the camera and GPS when the mission modal closes. */
function teardownSubmission() {
  stopLocationSampling();
  closeSubmissionCamera();
}

/** Wire the mission modal's buttons. Called once from app.js. */
function setupSubmissionListeners() {
  document.getElementById('submissionForm')?.addEventListener('submit', submitMission);
  document.getElementById('openCameraBtn')?.addEventListener('click', openSubmissionCamera);
  document.getElementById('snapPhotoBtn')?.addEventListener('click', snapSubmissionPhoto);
  document.getElementById('photoFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      closeSubmissionCamera();
      setSubmissionPhoto(file, `Using ${file.name}.`);
    }
  });
  document.getElementById('demoLocationToggle')?.addEventListener('change', (e) => {
    submission.demo = e.target.checked;
    if (submission.demo) {
      stopLocationSampling();
    } else {
      startLocationSampling();
    }
    updateSubmissionStatus();
  });
}
