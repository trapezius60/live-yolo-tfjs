// --------------------- Config ---------------------
const MODEL_URL = './yolov8n_web_model/model.json';  // TFJS model folder
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

// --------------------- Non-Max Suppression ---------------------
function nonMaxSuppression(boxes, scores, iouThreshold=0.5) {
  const selectedIndices = [];
  const sorted = scores
    .map((s,i)=>({score:s, i}))
    .sort((a,b)=>b.score - a.score)
    .map(o=>o.i);

  while (sorted.length > 0) {
    const i = sorted.shift();
    selectedIndices.push(i);
    const toRemove = [];
    for (let j = 0; j < sorted.length; j++) {
      const k = sorted[j];
      const iou = intersectionOverUnion(boxes[i], boxes[k]);
      if (iou > iouThreshold) toRemove.push(j);
    }
    for (let r = toRemove.length-1; r>=0; r--) sorted.splice(toRemove[r],1);
  }
  return selectedIndices;
}

function intersectionOverUnion(boxA, boxB) {
  const [y1A, x1A, y2A, x2A] = boxA;
  const [y1B, x1B, y2B, x2B] = boxB;
  const interArea = Math.max(0, Math.min(x2A,x2B)-Math.max(x1A,x1B)) *
                    Math.max(0, Math.min(y2A,y2B)-Math.max(y1A,y1B));
  const boxAArea = (x2A-x1A)*(y2A-y1A);
  const boxBArea = (x2B-x1B)*(y2B-y1B);
  return interArea / (boxAArea + boxBArea - interArea);
}

// --------------------- Detection Loop ---------------------
let model;
const numClasses = 80;

async function detectLoop() {
  const input = tf.tidy(() => {
    const frame = tf.browser.fromPixels(webcam);
    return tf.image.resizeBilinear(frame, [640,640]).div(255.0).expandDims(0);
  });

  let output;
  try {
    output = await model.executeAsync(input);
  } catch(e){
    output = await model.execute(input);
  }

  const data = await output.data();
  const numAnchors = output.shape[2];

  const boxes = [], scoresArr = [], classesArr = [];
  const confThreshold = Number(thresh.value);

  for(let i=0;i<numAnchors;i++){
    const offset = i*(numClasses+4);
    const x = data[offset+0];
    const y = data[offset+1];
    const w = data[offset+2];
    const h = data[offset+3];

    let maxScore = -Infinity, maxClass = -1;
    for(let c=0;c<numClasses;c++){
      const score = data[offset+4+c];
      if(score>maxScore){ maxScore=score; maxClass=c; }
    }

    if(maxScore > confThreshold){
      boxes.push([(y-h/2)/640, (x-w/2)/640, (y+h/2)/640, (x+w/2)/640]);
      scoresArr.push(maxScore);
      classesArr.push(maxClass);
    }
  }

  const selected = nonMaxSuppression(boxes, scoresArr, 0.5);
  drawDetections(
    selected.map(i=>boxes[i]),
    selected.map(i=>scoresArr[i]),
    selected.map(i=>classesArr[i])
  );

  tf.dispose([input, output]);
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
