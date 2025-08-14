// --------------------- Config ---------------------
const MODEL_URL = './yolov8n_web_model/model.json'; // TFJS model folder
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

// --------------------- DOM Elements ---------------------
const webcam = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const thresh = document.getElementById('thresh');
const threshVal = document.getElementById('threshVal');

thresh.addEventListener('input', () => {
  threshVal.textContent = Number(thresh.value).toFixed(2);
});

// --------------------- Webcam Setup ---------------------
async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { exact: "environment" } }, // back camera
    audio: false
  });
  webcam.srcObject = stream;
  await new Promise(res => (webcam.onloadedmetadata = res));
  canvas.width = webcam.videoWidth;
  canvas.height = webcam.videoHeight;
}

// --------------------- Draw Function ---------------------
function drawDetections(boxes, scores, classes) {
  ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 2;
  ctx.font = '16px system-ui';
  ctx.textBaseline = 'top';

  for (let i = 0; i < scores.length; i++) {
    const [ymin, xmin, ymax, xmax] = boxes[i];
    const x = xmin * canvas.width;
    const y = ymin * canvas.height;
    const w = (xmax - xmin) * canvas.width;
    const h = (ymax - ymin) * canvas.height;

    const label = (COCO_CLASSES[classes[i]] || `cls ${classes[i]}`) + ` ${(scores[i]*100).toFixed(1)}%`;

    // box
    ctx.strokeStyle = 'white';
    ctx.strokeRect(x, y, w, h);
    // label background
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

// --------------------- Detection Loop ---------------------
let model;

async function detectLoop() {
  const input = tf.tidy(() => tf.browser.fromPixels(webcam)
    .resizeBilinear([640,640])
    .div(255.0)
    .expandDims(0)
  );

  let results;
  try {
    results = await model.executeAsync(input);
  } catch(e){
    results = await model.execute(input);
  }

  // Ultralytics TFJS output: [boxes, scores, classes]
  const boxes = results[0].arraySync();   // [num_boxes,4] normalized ymin,xmin,ymax,xmax
  const scores = results[1].arraySync();  // [num_boxes]
  const classes = results[2].arraySync(); // [num_boxes]

  // apply confidence threshold
  const confThreshold = Number(thresh.value);
  const filteredIndices = scores.map((s,i)=>s>confThreshold?i:-1).filter(i=>i>=0);

  drawDetections(
    filteredIndices.map(i=>boxes[i]),
    filteredIndices.map(i=>scores[i]),
    filteredIndices.map(i=>classes[i])
  );

  tf.dispose([input, results]);
  requestAnimationFrame(detectLoop);
}

// --------------------- Initialization ---------------------
(async () => {
  try {
    statusEl.textContent = 'Requesting camera…';
    await setupCamera();

    statusEl.textContent = 'Loading model…';
    model = await tf.loadGraphModel(MODEL_URL);

    statusEl.textContent = 'Model loaded. Starting detection…';
    detectLoop();
  } catch(e){
    console.error(e);
    statusEl.textContent = 'Initialization error. See console.';
  }
})();
