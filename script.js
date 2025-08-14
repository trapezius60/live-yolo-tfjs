// --------------------- Config ---------------------
const MODEL_URL = './yolov8n_web_model/model.json';
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

// --------------------- DOM ---------------------
const webcam = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const thresh = document.getElementById('thresh');
const threshVal = document.getElementById('threshVal');

thresh.addEventListener('input', () => {
  threshVal.textContent = Number(thresh.value).toFixed(2);
});

// --------------------- Webcam ---------------------
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

// --------------------- Draw ---------------------
function drawDetections(boxes, scores, classes) {
  ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 2;
  ctx.font = '16px system-ui';
  ctx.textBaseline = 'top';

  for (let i = 0; i < scores.length; i++) {
    const [ymin, xmin, ymax, xmax] = boxes[i];
    const x = xmin;
    const y = ymin;
    const w = xmax - xmin;
    const h = ymax - ymin;

    const label = (COCO_CLASSES[classes[i]] || `cls ${classes[i]}`) + ` ${(scores[i]*100).toFixed(1)}%`;

    ctx.strokeStyle = 'white';
    ctx.strokeRect(x, y, w, h);

    const pad = 4;
    const textW = ctx.measureText(label).width;
    const textH = 18;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y - textH, textW + pad*2, textH);
    ctx.fillStyle = 'white';
    ctx.fillText(label, x + pad, y - textH + 2);
  }
}

// --------------------- NMS ---------------------
function intersectionOverUnion(boxA, boxB) {
  const [y1A, x1A, y2A, x2A] = boxA;
  const [y1B, x1B, y2B, x2B] = boxB;
  const interArea = Math.max(0, Math.min(x2A,x2B)-Math.max(x1A,x1B)) *
                    Math.max(0, Math.min(y2A,y2B)-Math.max(y1A,y1B));
  const boxAArea = (x2A-x1A)*(y2A-y1A);
  const boxBArea = (x2B-x1B)*(y2B-y1B);
  return interArea / (boxAArea + boxBArea - interArea);
}

function nonMaxSuppression(boxes, scores, iouThreshold=0.4){
  const selectedIndices = [];
  const sorted = scores.map((s,i)=>({score:s,i})).sort((a,b)=>b.score-a.score).map(o=>o.i);

  while(sorted.length > 0){
    const i = sorted.shift();
    selectedIndices.push(i);
    const toRemove = [];
    for(let j=0;j<sorted.length;j++){
      const k = sorted[j];
      if(intersectionOverUnion(boxes[i], boxes[k])>iouThreshold) toRemove.push(j);
    }
    for(let r=toRemove.length-1;r>=0;r--) sorted.splice(toRemove[r],1);
  }
  return selectedIndices;
}

// --------------------- Detection Loop ---------------------
let model;
const numClasses = 80;

async function detectLoop() {
  const input = tf.tidy(() => tf.browser.fromPixels(webcam)
    .resizeBilinear([640,640])
    .div(255.0)
    .expandDims(0)
  );

  let output;
  try { output = await model.executeAsync(input); } 
  catch(e){ output = await model.execute(input); }

  // raw output shape [1, N, 85]
  const data = output.arraySync()[0]; // [N,85]
  const boxes = [], scoresArr = [], classesArr = [];
  const confThreshold = Number(thresh.value);

  const scaleX = canvas.width / 640;
  const scaleY = canvas.height / 640;

  for(const row of data){
    const [x, y, w, h, conf, ...classProbs] = row;
    const maxClassScore = Math.max(...classProbs);
    const classIndex = classProbs.indexOf(maxClassScore);
    const finalScore = conf * maxClassScore;

    if(finalScore < confThreshold) continue; // filter low confidence

    // optional: only detect person (class 0)
    // if(classIndex !== 0) continue;

    // scale to canvas size
    const ymin = (y - h/2) * scaleY;
    const xmin = (x - w/2) * scaleX;
    const ymax = (y + h/2) * scaleY;
    const xmax = (x + w/2) * scaleX;

    boxes.push([ymin,xmin,ymax,xmax]);
    scoresArr.push(finalScore);
    classesArr.push(classIndex);
  }

  const selected = nonMaxSuppression(boxes, scoresArr, 0.4);
  drawDetections(
    selected.map(i=>boxes[i]),
    selected.map(i=>scoresArr[i]),
    selected.map(i=>classesArr[i])
  );

  tf.dispose([input, output]);
  requestAnimationFrame(detectLoop);
}

// --------------------- Init ---------------------
(async () => {
  try{
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
