// --------------------- Config ---------------------
const MODEL_URL = './yolov8n_web_model/model.json';
const COCO_CLASSES = [
  'person','bicycle','car','motorcycle','airplane','bus','train','truck','boat',
  'traffic light','fire hydrant','stop sign','parking meter','bench','bird','cat','dog',
  'horse','sheep','cow','elephant','bear','zebra','backpack','umbrella','handbag','tie',
  'suitcase','frisbee','skis','snowboard','sports ball','kite','baseball bat','baseball glove',
  'skateboard','surfboard','tennis racket','bottle','wine glass','cup','fork','knife','spoon',
  'bowl','banana','apple','sandwich','orange','broccoli','carrot','hot dog','pizza','donut',
  'cake','chair','couch','potted plant','bed','dining table','toilet','tv','laptop','mouse',
  'remote','keyboard','cell phone','microwave','oven','toaster','sink','refrigerator','book',
  'clock','vase','scissors','teddy bear','hair drier','toothbrush'
];

// --------------------- DOM ---------------------
const webcam = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const thresh = document.getElementById('thresh');
const threshVal = document.getElementById('threshVal');

// --------------------- State ---------------------
let model, currentStream, isDetecting = false;

// --------------------- UI ---------------------
thresh.addEventListener('input', () => {
  threshVal.textContent = Number(thresh.value).toFixed(2);
});

// --------------------- Camera ---------------------
async function startCamera() {
  if (currentStream) currentStream.getTracks().forEach(t => t.stop());

  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: 'environment' } }, audio: false
    });
  } catch {
    currentStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }

  webcam.srcObject = currentStream;
  await webcam.play();

  canvas.width = webcam.videoWidth;
  canvas.height = webcam.videoHeight;

  isDetecting = true;
  detectLoop();
}

// --------------------- Draw Detections ---------------------
function drawDetections(boxes, scores, classes) {
  ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);

  for (let i = 0; i < boxes.length; i++) {
    const [y1, x1, y2, x2] = boxes[i];
    const className = COCO_CLASSES[classes[i]] || 'Unknown';
    const conf = Math.round(scores[i]*100);
    const color = 'red';

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x1, y1, x2-x1, y2-y1);

    ctx.fillStyle = color;
    ctx.font = '16px Arial';
    ctx.fillText(`${className} ${conf}%`, x1+5, y1+20);
  }
}

// --------------------- Process Model ---------------------
function processModelOutput(output) {
  const preds = output.arraySync()[0];  // 1x8400x85
  const boxes = [], scores = [], classes = [];
  const confThreshold = Number(thresh.value);

  const scaleX = canvas.width / 640;
  const scaleY = canvas.height / 640;

  for (let i=0;i<preds.length;i++) {
    const [cx, cy, w, h, obj, ...clsScores] = preds[i];
    let maxScore = Math.max(...clsScores);
    let cls = clsScores.indexOf(maxScore);
    let conf = obj * maxScore;
    if(conf < confThreshold) continue;

    const x1 = (cx - w/2) * scaleX;
    const y1 = (cy - h/2) * scaleY;
    const x2 = (cx + w/2) * scaleX;
    const y2 = (cy + h/2) * scaleY;

    boxes.push([y1, x1, y2, x2]);
    scores.push(conf);
    classes.push(cls);
  }

  return {boxes, scores, classes};
}

// --------------------- NMS ---------------------
function nonMaxSuppression(boxes, scores, iouThreshold=0.4) {
  if(boxes.length==0) return [];
  const indices = scores.map((s,i)=>({s,i})).sort((a,b)=>b.s-a.s).map(e=>e.i);
  const selected = [];
  while(indices.length>0){
    const current = indices.shift();
    selected.push(current);
    const rest = [];
    for(const idx of indices){
      const [y1a,x1a,y2a,x2a]=boxes[current];
      const [y1b,x1b,y2b,x2b]=boxes[idx];
      const xi1=Math.max(x1a,x1b), yi1=Math.max(y1a,y1b);
      const xi2=Math.min(x2a,x2b), yi2=Math.min(y2a,y2b);
      const inter=Math.max(0,xi2-xi1)*Math.max(0,yi2-yi1);
      const iou = inter/((x2a-x1a)*(y2a-y1a)+(x2b-x1b)*(y2b-y1b)-inter+1e-8);
      if(iou<=iouThreshold) rest.push(idx);
    }
    indices.splice(0,indices.length,...rest);
  }
  return selected;
}

// --------------------- Detection Loop ---------------------
async function detectLoop() {
  if(!isDetecting || !model) return requestAnimationFrame(detectLoop);

  const input = tf.tidy(()=>tf.browser.fromPixels(webcam).resizeBilinear([640,640]).div(255).expandDims(0));
  let output = await model.executeAsync(input);
  const {boxes,scores,classes} = processModelOutput(output);
  const selected = nonMaxSuppression(boxes, scores, 0.4);

  drawDetections(selected.map(i=>boxes[i]), selected.map(i=>scores[i]), selected.map(i=>classes[i]));

  input.dispose();
  if(Array.isArray(output)) output.forEach(t=>t.dispose()); else output.dispose();

  requestAnimationFrame(detectLoop);
}

// --------------------- Initialize ---------------------
async function initializeApp() {
  statusEl.textContent='Loading model...';
  model = await tf.loadGraphModel(MODEL_URL);
  const warmup = tf.zeros([1,640,640,3]);
  let o = await model.executeAsync(warmup); warmup.dispose(); if(Array.isArray(o)) o.forEach(t=>t.dispose()); else o.dispose();
  statusEl.textContent='Model loaded. Click button to start camera';
  const btn=document.createElement('button');
  btn.textContent='Start Camera';
  btn.onclick=startCamera;
  document.body.appendChild(btn);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initializeApp); else initializeApp();
