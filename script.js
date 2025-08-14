const MODEL_URL = './tfjs_model/model.json';  // adjust if you place it elsewhere
const webcam = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const thresh = document.getElementById('thresh');
const threshVal = document.getElementById('threshVal');

// COCO 80 labels (if you used yolov8n.pt). Replace with your custom class names if you trained custom data.
const COCO_CLASSES = [
 'person','bicycle','car','motorcycle','airplane','bus','train','truck','boat','traffic light',
 'fire hydrant','stop sign','parking meter','bench','bird','cat','dog','horse','sheep','cow',
 'elephant','bear','zebra','giraffe','backpack','umbrella','handbag','tie','suitcase',
 'frisbee','skis','snowboard','sports ball','kite','baseball bat','baseball glove','skateboard','surfboard','tennis racket',
 'bottle','wine glass','cup','fork','knife','spoon','bowl','banana','apple','sandwich',
 'orange','broccoli','carrot','hot dog','pizza','donut','cake','chair','couch','potted plant',
 'bed','dining table','toilet','tv','laptop','mouse','remote','keyboard','cell phone',
 'microwave','oven','toaster','sink','refrigerator','book','clock','vase','scissors','teddy bear','hair drier','toothbrush'
];

let model;

thresh.addEventListener('input', () => {
  threshVal.textContent = Number(thresh.value).toFixed(2);
});

async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
  webcam.srcObject = stream;
  await new Promise(res => (webcam.onloadedmetadata = res));
  // Set canvas size to the actual video size
  canvas.width = webcam.videoWidth;
  canvas.height = webcam.videoHeight;
}

function drawDetections(boxes, scores, classes, scoreThreshold) {
  ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 2;
  ctx.font = '16px system-ui';
  ctx.textBaseline = 'top';

  for (let i = 0; i < scores.length; i++) {
    const score = scores[i];
    if (score < scoreThreshold) continue;

    const [ymin, xmin, ymax, xmax] = boxes[i]; // normalized
    const x = xmin * canvas.width;
    const y = ymin * canvas.height;
    const w = (xmax - xmin) * canvas.width;
    const h = (ymax - ymin) * canvas.height;

    const cls = classes[i];
    const label = (COCO_CLASSES[cls] || `cls ${cls}`) + ` ${(score*100).toFixed(1)}%`;

    // box
    ctx.strokeStyle = 'white';
    ctx.strokeRect(x, y, w, h);
    // label bg
    const pad = 4;
    const textW = ctx.measureText(label).width;
    const textH = 18;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y - textH, textW + pad*2, textH);
    // text
    ctx.fillStyle = 'white';
    ctx.fillText(label, x + pad, y - textH + 2);
  }
}

/**
 * Many YOLO TFJS exports (via Ultralytics) include postprocessing (NMS) and return:
 *  - boxes:   [1, N, 4]  (ymin, xmin, ymax, xmax) normalized
 *  - scores:  [1, N]
 *  - classes: [1, N]
 *  - nums:    [1]
 * The code below handles that common case and logs shapes if it differs.
 */
async function detectLoop() {
  // Read frame → tensor
  const input = tf.tidy(() => {
    const frame = tf.browser.fromPixels(webcam);
    // Resize to model input if required (640x640 is common); keep normalization [0,1]
    const resized = tf.image.resizeBilinear(frame, [640, 640]);
    const normalized = resized.div(255.0);
    return normalized.expandDims(0);
  });

  let outputs;
  try {
    outputs = await model.executeAsync(input);
  } catch (e) {
    console.error('Model execution error:', e);
    statusEl.textContent = 'Error running model (see console).';
    input.dispose();
    requestAnimationFrame(detectLoop);
    return;
  }

  // Try to normalize outputs into arrays
  let boxesT, scoresT, classesT, numsT;
  if (Array.isArray(outputs) && outputs.length >= 4) {
    [boxesT, scoresT, classesT, numsT] = outputs;
  } else {
    console.warn('Unexpected model outputs. Inspecting: ', outputs);
    statusEl.textContent = 'Unexpected model outputs (check console).';
    tf.dispose([input, outputs]);
    requestAnimationFrame(detectLoop);
    return;
  }

  const boxes = await boxesT.data();     // Float32Array length = 4*N
  const scores = await scoresT.data();   // Float32Array length = N
  const classes = await classesT.data(); // Float32Array length = N
  const nums = await numsT.data();       // Int32Array length = 1

  const n = nums[0];
  // Repack boxes to [[ymin,xmin,ymax,xmax], ...]
  const boxesArr = [];
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    boxesArr.push([boxes[o + 0], boxes[o + 1], boxes[o + 2], boxes[o + 3]]);
  }
  const scoresArr = Array.from(scores).slice(0, n);
  const classesArr = Array.from(classes).slice(0, n).map(v => Math.round(v));

  drawDetections(boxesArr, scoresArr, classesArr, Number(thresh.value));

  tf.dispose([input, boxesT, scoresT, classesT, numsT, outputs]);
  await tf.nextFrame();
  requestAnimationFrame(detectLoop);
}

(async () => {
  try {
    statusEl.textContent = 'Requesting camera…';
    await setupCamera();
    statusEl.textContent = 'Loading model…';
    model = await tf.loadGraphModel(MODEL_URL);
    statusEl.textContent = 'Model loaded. Starting detection…';
    detectLoop();
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Init error (camera or model). See console.';
  }
})();
