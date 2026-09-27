/**Camera and GPS trail capture for mission submissions.

While the camera is open, the page samples the phone's GPS every couple of
seconds for about 20 seconds. The server checks that trail: real GPS wobbles
a few meters and reports 5 to 50 m accuracy, while a faked location is usually
perfectly still, perfectly round, or sitting exactly on the place's pin.

Camera and location only work on https:// pages or http://localhost.

Example:
    const video = document.querySelector('video');
    const result = await WebPassCapture.verifyVisit({
      apiBase: 'http://localhost:3000',
      placeId: 'apollo-theater',
      video,
      xrplAddress: 'r...',
      solanaAddress: '...',
      caption: 'At the Apollo marquee',
      onProgress: (p) => console.log(`${p.readings} GPS readings, ${p.secondsLeft}s left`),
    });
    console.log(result.status, result.body);
*/
(function () {
  'use strict';

  const DEFAULTS = {
    durationMs: 20000,
    intervalMs: 2000,
    readingTimeoutMs: 10000,
    maxReadings: 60,
  };

  /** What the server needs before it will look at a trail. */
  const TRAIL_REQUIREMENTS = { minReadings: 5, minSpanMs: 10000 };

  /** Safari on macOS counts GeolocationPosition.timestamp from 2001-01-01
      (Apple's reference date) instead of 1970, so its fixes look 31 years old. */
  const APPLE_EPOCH_OFFSET_MS = 978307200000;
  const DAY_MS = 24 * 60 * 60 * 1000;

  /** Turn a browser fix timestamp into epoch ms, fixing Safari's 2001-based clock.

  Args:
      timestamp (number): position.timestamp as the browser reported it.
      now (number): The current time in epoch ms.

  Returns:
      number: The fix time in epoch ms.
  */
  function normalizeTimestamp(timestamp, now = Date.now()) {
    const ms = Math.round(timestamp);
    if (Math.abs(now - ms) > DAY_MS && Math.abs(now - (ms + APPLE_EPOCH_OFFSET_MS)) < DAY_MS) {
      return ms + APPLE_EPOCH_OFFSET_MS;
    }
    return ms;
  }

  function toReading(position) {
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: normalizeTimestamp(position.timestamp),
    };
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function readPosition(timeoutMs) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: timeoutMs,
      });
    });
  }

  /** Open the back camera and show it in a video element.

  Args:
      video (HTMLVideoElement): Where to show the live camera.

  Returns:
      Promise<MediaStream>: The camera stream. Pass it to closeCamera when done.

  Raises:
      Error: If the browser has no camera access or the user refuses it.
  */
  async function openCamera(video) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('This browser cannot open the camera. Use https:// or localhost.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.muted = true;
    await video.play();
    return stream;
  }

  /** Stop the camera.

  Args:
      stream (MediaStream): The stream returned by openCamera.
  */
  function closeCamera(stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  /** Take a photo from the live camera.

  Args:
      video (HTMLVideoElement): A video element showing the camera.

  Returns:
      Promise<Blob>: A JPEG of the current frame.
  */
  function capturePhoto(video) {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not capture the photo.'))), 'image/jpeg', 0.9);
    });
  }

  /** Sample GPS readings for a while, the way the server expects.

  Each reading is a fresh fix (no cached positions). Readings the browser
  repeats with the same timestamp are skipped so the trail stays in time order.

  Args:
      options (Object): Optional settings.
      options.durationMs (number): How long to sample. Defaults to 20 seconds.
      options.intervalMs (number): Time between readings. Defaults to 2 seconds.
      options.onReading (function): Called with { reading, readings, secondsLeft } after each reading.

  Returns:
      Promise<Array<{latitude: number, longitude: number, accuracy: number, timestamp: number}>>:
          The readings, oldest first.

  Raises:
      Error: If location is unavailable or the user refuses it.
  */
  async function collectTrail(options = {}) {
    if (!navigator.geolocation) {
      throw new Error('This browser cannot read the location. Use https:// or localhost.');
    }
    const durationMs = options.durationMs ?? DEFAULTS.durationMs;
    const intervalMs = options.intervalMs ?? DEFAULTS.intervalMs;
    const trail = [];
    const endAt = Date.now() + durationMs;

    while (Date.now() < endAt) {
      const tickStarted = Date.now();
      const reading = toReading(await readPosition(DEFAULTS.readingTimeoutMs));
      const previous = trail[trail.length - 1];
      if (!previous || reading.timestamp > previous.timestamp) {
        trail.push(reading);
      }
      if (options.onReading) {
        options.onReading({ reading, readings: trail.length, secondsLeft: Math.max(0, Math.ceil((endAt - Date.now()) / 1000)) });
      }
      await sleep(Math.max(0, intervalMs - (Date.now() - tickStarted)));
    }
    return trail;
  }

  /** Keep sampling GPS in the background until stopped, for flows where the
  user takes their time framing the photo.

  Only the newest readings are kept, so the trail stays recent however long
  the camera is open.

  Args:
      options (Object): Optional settings.
      options.intervalMs (number): Time between readings. Defaults to 2 seconds.
      options.maxReadings (number): How many of the newest readings to keep. Defaults to 60.
      options.onReading (function): Called with (reading, trail) after each new reading.
      options.onError (function): Called with each location error. Sampling stops
          for good if the user refuses location access.

  Returns:
      { stop: function, trail: function, repeatedReadings: function }: stop()
          ends sampling; trail() returns the readings so far, oldest first;
          repeatedReadings() counts fixes in a row that repeated the last
          timestamp, which is what a location override or a stuck GPS does.
  */
  function startTrail(options = {}) {
    const intervalMs = options.intervalMs ?? DEFAULTS.intervalMs;
    const maxReadings = options.maxReadings ?? DEFAULTS.maxReadings;
    const trail = [];
    let stopped = false;
    let repeated = 0;

    if (!navigator.geolocation) {
      stopped = true;
      setTimeout(() => options.onError && options.onError(new Error('This browser cannot read the location. Use https:// or localhost.')), 0);
    }

    (async () => {
      while (!stopped) {
        const tickStarted = Date.now();
        try {
          const reading = toReading(await readPosition(DEFAULTS.readingTimeoutMs));
          if (stopped) break;
          const previous = trail[trail.length - 1];
          if (!previous || reading.timestamp > previous.timestamp) {
            repeated = 0;
            trail.push(reading);
            if (trail.length > maxReadings) {
              trail.shift();
            }
            if (options.onReading) {
              options.onReading(reading, trail.slice());
            }
          } else {
            repeated += 1;
          }
        } catch (error) {
          if (stopped) break;
          if (options.onError) {
            options.onError(error);
          }
          if (error && error.code === 1) {
            stopped = true;
            break;
          }
        }
        await sleep(Math.max(0, intervalMs - (Date.now() - tickStarted)));
      }
    })();

    return {
      stop() {
        stopped = true;
      },
      trail() {
        return trail.slice();
      },
      repeatedReadings() {
        return repeated;
      },
    };
  }

  /** How close a trail is to what the server needs.

  Args:
      trail (Array): GPS readings, oldest first.

  Returns:
      { readings: number, spanMs: number, ready: boolean }: Reading count, time
          covered, and whether both meet the server's minimums.
  */
  function trailProgress(trail) {
    const spanMs = trail.length > 1 ? trail[trail.length - 1].timestamp - trail[0].timestamp : 0;
    return {
      readings: trail.length,
      spanMs,
      ready: trail.length >= TRAIL_REQUIREMENTS.minReadings && spanMs >= TRAIL_REQUIREMENTS.minSpanMs,
    };
  }

  /** Build the multipart form for POST /submissions.

  The submitted location is the trail's last reading, which the server
  requires.

  Args:
      fields (Object): What to send.
      fields.placeId (string): The place being visited.
      fields.photo (Blob): The photo taken with the camera.
      fields.trail (Array): GPS readings from collectTrail.
      fields.xrplAddress (string): Visitor's XRPL address for the reward.
      fields.solanaAddress (string): Visitor's Solana address for the stamp.
      fields.caption (string): Optional caption for the AI referee.
      fields.requestId (string): Optional idempotency key. Defaults to a random one.

  Returns:
      FormData: Ready to send.

  Raises:
      Error: If the trail is empty.
  */
  function buildSubmission(fields) {
    if (!fields.trail || fields.trail.length === 0) {
      throw new Error('No GPS readings were collected.');
    }
    const last = fields.trail[fields.trail.length - 1];
    const form = new FormData();
    form.append('placeId', fields.placeId);
    form.append('latitude', String(last.latitude));
    form.append('longitude', String(last.longitude));
    form.append('locationTrail', JSON.stringify(fields.trail));
    form.append('timestamp', new Date().toISOString());
    form.append('xrplAddress', fields.xrplAddress);
    form.append('solanaAddress', fields.solanaAddress);
    form.append('requestId', fields.requestId || crypto.randomUUID());
    if (fields.caption) {
      form.append('caption', fields.caption);
    }
    form.append('photo', fields.photo, 'photo.jpg');
    return form;
  }

  /** Open the camera, collect a GPS trail while it is open, take the photo,
  and submit it.

  Args:
      options (Object): Everything buildSubmission needs except photo and trail, plus:
      options.apiBase (string): Backend address, such as http://localhost:3000.
      options.video (HTMLVideoElement): Where to show the camera.
      options.durationMs (number): How long to sample GPS. Defaults to 20 seconds.
      options.onProgress (function): Called with { readings, secondsLeft } while sampling.

  Returns:
      Promise<{status: number, body: Object}>: The server's HTTP status and JSON answer.
          A 422 with status BLOCKED_SENTINEL lists the reasons, such as a frozen GPS trail.
  */
  async function verifyVisit(options) {
    const stream = await openCamera(options.video);
    try {
      const trail = await collectTrail({
        durationMs: options.durationMs,
        onReading: options.onProgress,
      });
      const photo = await capturePhoto(options.video);
      const form = buildSubmission({ ...options, photo, trail });
      const response = await fetch(`${options.apiBase}/submissions`, { method: 'POST', body: form });
      const body = await response.json().catch(() => null);
      return { status: response.status, body };
    } finally {
      closeCamera(stream);
    }
  }

  window.WebPassCapture = {
    TRAIL_REQUIREMENTS,
    openCamera,
    closeCamera,
    capturePhoto,
    collectTrail,
    startTrail,
    trailProgress,
    normalizeTimestamp,
    buildSubmission,
    verifyVisit,
  };
})();
