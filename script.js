// --------------------- Config ---------------------
const MODEL_URL = './yolov8n_web_model/model.json';
const COCO_CLASSES = [
  'person','bicycle','car','motorcycle','airplane','bus','train','truck','boat','traffic light',
  'fire hydrant','stop sign','parking meter','bench','bird','cat','dog','horse','sheep','cow',
  'elephant','bear','zebra','backpack','umbrella','handbag','tie','suitcase',
  'frisbee','skis','snowboard','sports ball','kite','baseball bat','baseball glove','skateboard','surfboard','tennis racket',
  'bottle','wine glass','cup','fork','knife','spoon','bowl','banana','apple','sandwich',
  'orange','broccoli','carrot','hot dog','pizza','donut','cake','chair','couch','potted plant',
  'bed','dining table','toilet','tv','laptop','mouse','remote','keyboard','cell phone',
  'microwave','oven','toaster','sink','refrigerator','book','clock','vase','scissors','teddy bear','hair drier','toothbrush'
];

// --------------------- DOM Elements ---------------------
const webcam = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const thresh = document.getElementById('thresh');
const threshVal = document.getElementById('threshVal');

// --------------------- State Variables ---------------------
let model;
let currentStream;
let isDetecting = false;
let cameraReady = false;

// --------------------- Event Listeners ---------------------
thresh.addEventListener('input', () => {
  threshVal.textContent = Number(thresh.value).toFixed(2);
});

// --------------------- Camera Functions ---------------------
function createCameraButton() {
  const button = document.createElement('button');
  button.textContent = 'Start Camera';
  button.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    padding: 20px 40px;
    font-size: 18px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    z-index: 1000;
  `;
  button.onclick = async () => {
    await startCamera();
    button.remove();
  };
  document.body.appendChild(button);
}

async function startCamera() {
  statusEl.textContent = '🎥 Starting camera...';

  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }

  const constraints = {
    video: { facingMode: { exact: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  };

  try {
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    webcam.srcObject = currentStream;
    webcam.muted = true;
    webcam.playsInline = true;
    webcam.autoplay = true;

    await new Promise(resolve => webcam.addEventListener('loadeddata', resolve, { once: true }));
    canvas.width = webcam.videoWidth;
    canvas.height = webcam.videoHeight;

    cameraReady = true;
    statusEl.textContent = '✅ Camera ready';
  } catch (err) {
    console.error('Camera error:', err);
    statusEl.textContent = '❌ Camera failed';
  }
}

// --------------------- Drawing Functions ---------------------
function drawDetections(boxes, scores, classes) {
  if (!cameraReady) return;

  ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);

  for (let i = 0; i < boxes.length; i++) {
    const [x1, y1, x2, y2] = boxes[i];
    const w = x2 - x1;
    const h = y2 - y1;

    const className = COCO_CLASSES[classes[i]] || 'Unknown';
    const confidence = Math.round(scores[i] * 100);
    const label = `${className} ${confidence}%`;

    const colors = ['#FF0000','#00FF00','#0000FF','#FFFF00','#FF00FF','#00FFFF','#FFA500','#FF69B4'];
    const color = colors[classes[i] % colors.length];

    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(x1, y1, w, h);

    ctx.fillStyle = color;
    ctx.font = 'bold 16px Arial';
    const textWidth = ctx.measureText(label).width;
    const textHeight = 18;
    ctx.fillRect(x1, y1 - textHeight, textWidth + 8, textHeight);

    ctx.fillStyle = 'white';
    ctx.fillText(label, x1 + 4, y1 - 4);
  }
}

// --------------------- Model Processing ---------------------
function processModelOutput(output) {
  let predictions;
  if (Array.isArray(output)) output = output[0];
  if (output.shape.length === 3) predictions = output.arraySync()[0];
  else if (output.shape.length === 2) predictions = output.arraySync();
  else return { boxes: [], scores: [], classes: [] };

  const boxes = [];
  const scores = [];
  const classes = [];
  const confThreshold = Number(thresh.value);
  const scaleX = canvas.width / 640;
  const scaleY = canvas.height / 640;

  for (let i = 0; i < predictions.length; i++) {
    const pred = predictions[i];
    if (!pred || pred.length < 85) continue;

    const [centerX, centerY, width, height, objectness, ...classScores] = pred;
    let maxScore = -1, bestClass = -1;
    for (let j = 0; j < Math.min(classScores.length, 80); j++) {
      if (classScores[j] > maxScore) {
        maxScore = classScores[j];
        bestClass = j;
      }
    }

    const finalConfidence = objectness * maxScore;
    if (finalConfidence >= confThreshold) {
      const x1 = (centerX - width / 2) * scaleX;
      const y1 = (centerY - height / 2) * scaleY;
      const x2 = (centerX + width / 2) * scaleX;
      const y2 = (centerY + height / 2) * scaleY;

      boxes.push([x1, y1, x2, y2]);
      scores.push(finalConfidence);
      classes.push(bestClass);
    }
  }

  return { boxes, scores, classes };
}

// --------------------- Simple NMS ---------------------
function nonMaxSuppression(boxes, scores, iouThreshold = 0.4) {
  if (boxes.length === 0) return [];
  const indices = scores.map((s,i)=>({s,i})).sort((a,b)=>b.s-a.s).map(e=>e.i);
  const selected = [];
  while (indices.length) {
    const current = indices.shift();
    selected.push(current);
    const remaining = [];
    for (const idx of indices) {
      const iou = calculateIoU(boxes[current], boxes[idx]);
      if (iou <= iouThreshold) remaining.push(idx);
    }
    indices.length = 0;
    indices.push(...remaining);
  }
  return selected;
}

function calculateIoU(boxA, boxB) {
  const [x1A, y1A, x2A, y2A] = boxA;
  const [x1B, y1B, x2B, y2B] = boxB;
  const interX1 = Math.max(x1A, x1B);
  const interY1 = Math.max(y1A, y1B);
  const interX2 = Math.min(x2A, x2B);
  const interY2 = Math.min(y2A, y2B);
  const interArea = Math.max(0, interX2 - interX1) * Math.max(0, interY2 - interY1);
  const areaA = (x2A - x1A) * (y2A - y1A);
  const areaB = (x2B - x1B) * (y2B - y1B);
  return interArea / (areaA + areaB - interArea + 1e-8);
}

// --------------------- Detection Loop ---------------------
async function detectLoop() {
  if (!isDetecting || !model) {
    requestAnimationFrame(detectLoop);
    return;
  }

  if (cameraReady) {
    const input = tf.tidy(() => tf.browser.fromPixels(webcam).resizeBilinear([640,640]).div(255.0).expandDims(0));
    let output;
    try { output = await model.executeAsync(input); } catch { output = model.execute(input); }

    const { boxes, scores, classes } = processModelOutput(output);
        const selected = nonMaxSuppression(boxes, scores, 0.4);
    const finalBoxes = selected.map(i => boxes[i]);
    const finalScores = selected.map(i => scores[i]);
    const finalClasses = selected.map(i => classes[i]);

    drawDetections(finalBoxes, finalScores, finalClasses);

    input.dispose();
    if (Array.isArray(output)) output.forEach(t => t.dispose());
    else output.dispose();
  }

  requestAnimationFrame(detectLoop);
}

// --------------------- Initialization ---------------------
async function initializeApp() {
  statusEl.textContent = 'Initializing...';

  if (typeof tf === 'undefined') {
    statusEl.textContent = 'TensorFlow.js not loaded';
    return;
  }

  try {
    model = await tf.loadGraphModel(MODEL_URL);

    // Warmup
    const dummyInput = tf.zeros([1, 640, 640, 3]);
    const warmupOutput = await model.executeAsync(dummyInput);
    dummyInput.dispose();
    if (Array.isArray(warmupOutput)) warmupOutput.forEach(t => t.dispose());
    else warmupOutput.dispose();

    statusEl.textContent = 'Model loaded. Click button to start camera';
    createCameraButton();

    isDetecting = true;
    detectLoop();
  } catch (err) {
    console.error('Model load failed:', err);
    statusEl.textContent = '❌ Model failed to load';
  }
}

// --------------------- Start App ---------------------
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}


