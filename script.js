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
let animationId;
let isDetecting = false;
let debugMode = true; // Enable debug logging

// --------------------- Debug Functions ---------------------
function debugLog(message, data = null) {
  if (debugMode) {
    console.log(`[DEBUG] ${message}`, data || '');
    statusEl.textContent = message;
  }
}

// --------------------- Event Listeners ---------------------
thresh.addEventListener('input', () => {
  threshVal.textContent = Number(thresh.value).toFixed(2);
});

// --------------------- Camera Functions ---------------------
async function listAllCameras() {
  try {
    // First request permissions to get device labels
    const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
    tempStream.getTracks().forEach(track => track.stop());
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    
    debugLog(`Found ${videoDevices.length} camera(s)`);
    videoDevices.forEach((device, index) => {
      console.log(`Camera ${index + 1}:`, {
        deviceId: device.deviceId,
        label: device.label,
        groupId: device.groupId
      });
    });
    
    return videoDevices;
  } catch (error) {
    debugLog('Error listing cameras', error);
    return [];
  }
}

async function trySpecificCamera(deviceId, label) {
  debugLog(`Trying camera: ${label}`);
  
  try {
    const constraints = {
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 }
      },
      audio: false
    };
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    debugLog(`✅ Successfully opened: ${label}`);
    return stream;
  } catch (error) {
    debugLog(`❌ Failed to open: ${label} - ${error.message}`);
    return null;
  }
}

async function setupCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }

  debugLog('🎥 Starting camera setup...');
  
  // List all available cameras
  const cameras = await listAllCameras();
  if (cameras.length === 0) {
    debugLog('❌ No cameras found');
    return false;
  }

  // Try to find and use back camera first
  const backCameraKeywords = ['back', 'rear', 'environment', 'facing back', 'camera 0'];
  let backCamera = null;
  
  for (const camera of cameras) {
    const label = camera.label.toLowerCase();
    if (backCameraKeywords.some(keyword => label.includes(keyword))) {
      debugLog(`🎯 Found potential back camera: ${camera.label}`);
      backCamera = camera;
      break;
    }
  }

  // Try back camera first if found
  if (backCamera) {
    currentStream = await trySpecificCamera(backCamera.deviceId, backCamera.label);
    if (currentStream) {
      webcam.srcObject = currentStream;
      await waitForVideoReady();
      setupCanvas();
      return true;
    }
  }

  // Try all cameras one by one
  debugLog('🔄 Trying all cameras...');
  for (let i = 0; i < cameras.length; i++) {
    const camera = cameras[i];
    currentStream = await trySpecificCamera(camera.deviceId, camera.label);
    if (currentStream) {
      webcam.srcObject = currentStream;
      await waitForVideoReady();
      setupCanvas();
      return true;
    }
  }

  // Last resort: try with basic constraints
  debugLog('🆘 Trying basic camera constraints...');
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    webcam.srcObject = currentStream;
    await waitForVideoReady();
    setupCanvas();
    return true;
  } catch (error) {
    debugLog(`❌ All camera attempts failed: ${error.message}`);
    return false;
  }
}

async function waitForVideoReady() {
  return new Promise((resolve) => {
    if (webcam.readyState >= 2) {
      resolve();
    } else {
      webcam.addEventListener('loadeddata', resolve, { once: true });
    }
  });
}

function setupCanvas() {
  canvas.width = webcam.videoWidth;
  canvas.height = webcam.videoHeight;
  
  debugLog(`📐 Canvas set to: ${canvas.width}x${canvas.height}`);
  
  // Style canvas for responsive display
  const maxWidth = Math.min(window.innerWidth - 40, 800);
  const aspectRatio = canvas.height / canvas.width;
  canvas.style.width = `${maxWidth}px`;
  canvas.style.height = `${maxWidth * aspectRatio}px`;
  
  // Test drawing to make sure canvas works
  testCanvasDrawing();
}

function testCanvasDrawing() {
  debugLog('🎨 Testing canvas drawing...');
  
  // Draw a test rectangle
  ctx.strokeStyle = 'red';
  ctx.lineWidth = 5;
  ctx.strokeRect(50, 50, 100, 100);
  ctx.fillStyle = 'yellow';
  ctx.font = '20px Arial';
  ctx.fillText('TEST', 60, 80);
  
  setTimeout(() => {
    // Clear test drawing
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    debugLog('✅ Canvas drawing test completed');
  }, 2000);
}

// --------------------- Detection Functions ---------------------
function drawDetections(boxes, scores, classes) {
  // Clear canvas and draw video frame
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
  
  debugLog(`🎯 Drawing ${boxes.length} detections`);
  
  if (boxes.length === 0) {
    // Draw "No objects detected" message
    ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
    ctx.fillRect(10, 10, 200, 30);
    ctx.fillStyle = 'black';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('No objects detected', 15, 30);
    return;
  }

  // Draw each detection
  for (let i = 0; i < boxes.length; i++) {
    const [ymin, xmin, ymax, xmax] = boxes[i];
    const score = scores[i];
    const classId = classes[i];
    
    // Log each detection
    console.log(`Detection ${i}:`, {
      box: [ymin, xmin, ymax, xmax],
      score: score,
      class: COCO_CLASSES[classId] || `Unknown(${classId})`
    });
    
    // Ensure coordinates are valid
    const x = Math.max(0, Math.min(xmin, canvas.width - 1));
    const y = Math.max(0, Math.min(ymin, canvas.height - 1));
    const w = Math.max(1, Math.min(xmax - x, canvas.width - x));
    const h = Math.max(1, Math.min(ymax - y, canvas.height - y));

    const className = COCO_CLASSES[classId] || `Class_${classId}`;
    const confidence = (score * 100).toFixed(1);
    const label = `${className} ${confidence}%`;

    // Use bright, contrasting colors
    const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];
    const color = colors[classId % colors.length];

    // Draw thick bounding box
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);

    // Draw label background
    ctx.font = 'bold 16px Arial';
    const textMetrics = ctx.measureText(label);
    const textWidth = textMetrics.width;
    const textHeight = 20;
    const padding = 6;

    ctx.fillStyle = color;
    ctx.fillRect(x, y - textHeight - padding, textWidth + padding * 2, textHeight + padding);

    // Draw label text
    ctx.fillStyle = 'white';
    ctx.fillText(label, x + padding, y - 6);
  }

  // Draw detection count
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(10, canvas.height - 40, 250, 30);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 16px Arial';
  ctx.fillText(`Objects detected: ${boxes.length}`, 15, canvas.height - 20);
}

// --------------------- Model Processing ---------------------
function processModelOutput(output) {
  debugLog('🧠 Processing model output...');
  console.log('Model output shape:', output.shape);
  
  let predictions;
  if (output.shape.length === 3) {
    // [1, num_boxes, 85] format
    predictions = output.arraySync()[0];
  } else if (output.shape.length === 2) {
    // [num_boxes, 85] format
    predictions = output.arraySync();
  } else {
    debugLog('❌ Unexpected output shape', output.shape);
    return { boxes: [], scores: [], classes: [] };
  }

  debugLog(`📊 Processing ${predictions.length} predictions`);
  console.log('First prediction sample:', predictions[0]?.slice(0, 10));

  const boxes = [];
  const scores = [];
  const classes = [];
  const confThreshold = Number(thresh.value);
  
  const scaleX = canvas.width / 640;
  const scaleY = canvas.height / 640;

  let validPredictions = 0;
  
  for (let i = 0; i < predictions.length; i++) {
    const pred = predictions[i];
    
    if (!pred || pred.length < 85) continue;
    
    const [centerX, centerY, width, height, objectness, ...classScores] = pred;
    
    // Find the class with highest score
    let maxScore = -1;
    let bestClass = -1;
    
    for (let j = 0; j < Math.min(classScores.length, 80); j++) {
      if (classScores[j] > maxScore) {
        maxScore = classScores[j];
        bestClass = j;
      }
    }
    
    // Calculate final confidence
    const finalConfidence = objectness * maxScore;
    
    if (finalConfidence >= confThreshold) {
      validPredictions++;
      
      // Convert to corner coordinates and scale
      const x1 = (centerX - width / 2) * scaleX;
      const y1 = (centerY - height / 2) * scaleY;
      const x2 = (centerX + width / 2) * scaleX;
      const y2 = (centerY + height / 2) * scaleY;
      
      boxes.push([y1, x1, y2, x2]);
      scores.push(finalConfidence);
      classes.push(bestClass);
    }
  }
  
  debugLog(`✅ Found ${validPredictions} valid detections above threshold ${confThreshold}`);
  
  return { boxes, scores, classes };
}

// Simple NMS implementation
function nonMaxSuppression(boxes, scores, iouThreshold = 0.4) {
  if (boxes.length === 0) return [];
  
  const indices = Array.from({length: boxes.length}, (_, i) => i);
  indices.sort((a, b) => scores[b] - scores[a]);
  
  const selected = [];
  
  while (indices.length > 0) {
    const current = indices.shift();
    selected.push(current);
    
    const remaining = [];
    for (const idx of indices) {
      const iou = calculateIoU(boxes[current], boxes[idx]);
      if (iou <= iouThreshold) {
        remaining.push(idx);
      }
    }
    indices.length = 0;
    indices.push(...remaining);
  }
  
  return selected;
}

function calculateIoU(boxA, boxB) {
  const [y1A, x1A, y2A, x2A] = boxA;
  const [y1B, x1B, y2B, x2B] = boxB;
  
  const intersectX1 = Math.max(x1A, x1B);
  const intersectY1 = Math.max(y1A, y1B);
  const intersectX2 = Math.min(x2A, x2B);
  const intersectY2 = Math.min(y2A, y2B);
  
  const intersectArea = Math.max(0, intersectX2 - intersectX1) * 
                       Math.max(0, intersectY2 - intersectY1);
  
  const boxAArea = (x2A - x1A) * (y2A - y1A);
  const boxBArea = (x2B - x1B) * (y2B - y1B);
  
  return intersectArea / (boxAArea + boxBArea - intersectArea + 1e-8);
}

// --------------------- Detection Loop ---------------------
async function detectLoop() {
  if (!isDetecting || !model || !webcam.videoWidth) {
    requestAnimationFrame(detectLoop);
    return;
  }

  try {
    // Create input tensor
    const input = tf.tidy(() => {
      return tf.browser.fromPixels(webcam)
        .resizeBilinear([640, 640])
        .div(255.0)
        .expandDims(0);
    });

    // Run model inference
    let output;
    try {
      output = await model.executeAsync(input);
    } catch (e) {
      debugLog('Using synchronous execution');
      output = model.execute(input);
    }

    // Handle multiple outputs
    if (Array.isArray(output)) {
      output = output[0];
    }

    // Process predictions
    const { boxes, scores, classes } = processModelOutput(output);

    // Apply NMS
    const selectedIndices = nonMaxSuppression(boxes, scores, 0.4);
    
    const finalBoxes = selectedIndices.map(i => boxes[i]);
    const finalScores = selectedIndices.map(i => scores[i]);
    const finalClasses = selectedIndices.map(i => classes[i]);

    // Draw results
    drawDetections(finalBoxes, finalScores, finalClasses);

    // Clean up
    input.dispose();
    if (Array.isArray(output)) {
      output.forEach(t => t.dispose());
    } else {
      output.dispose();
    }

  } catch (error) {
    debugLog('❌ Detection error', error);
    console.error('Detection error:', error);
  }

  if (isDetecting) {
    requestAnimationFrame(detectLoop);
  }
}

// --------------------- Initialization ---------------------
async function initializeApp() {
  try {
    debugLog('🚀 Starting initialization...');
    
    // Check if TensorFlow.js is loaded
    if (typeof tf === 'undefined') {
      debugLog('❌ TensorFlow.js not loaded');
      return;
    }
    debugLog(`✅ TensorFlow.js version: ${tf.version.tfjs}`);
    
    // Setup camera
    const cameraSuccess = await setupCamera();
    if (!cameraSuccess) {
      debugLog('❌ Camera setup failed');
      return;
    }
    debugLog('✅ Camera setup successful');

    // Load model
    debugLog('📥 Loading model...');
    try {
      model = await tf.loadGraphModel(MODEL_URL);
      debugLog('✅ Model loaded successfully');
      
      // Print model info
      console.log('Model inputs:', model.inputs.map(i => ({ name: i.name, shape: i.shape })));
      console.log('Model outputs:', model.outputs.map(o => ({ name: o.name, shape: o.shape })));
      
    } catch (modelError) {
      debugLog('❌ Model loading failed', modelError);
      console.error('Model loading error:', modelError);
      return;
    }

    // Start detection
    debugLog('🎯 Starting detection loop...');
    isDetecting = true;
    detectLoop();
    
    debugLog('✅ Application ready! Look at the console for detailed logs.');
    
  } catch (error) {
    debugLog('❌ Initialization failed', error);
    console.error('Initialization error:', error);
  }
}

// --------------------- Start Application ---------------------
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
