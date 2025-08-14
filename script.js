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

// --------------------- Event Listeners ---------------------
thresh.addEventListener('input', () => {
  threshVal.textContent = Number(thresh.value).toFixed(2);
});

// --------------------- Camera Setup ---------------------
async function getCameraDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'videoinput');
  } catch (error) {
    console.error('Error getting camera devices:', error);
    return [];
  }
}

async function setupCamera() {
  // Stop existing stream if any
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }

  try {
    statusEl.textContent = 'Getting camera devices...';
    const devices = await getCameraDevices();
    console.log('Available cameras:', devices);

    let constraints = { audio: false };

    if (devices.length > 1) {
      // Try to find back/rear camera by label
      const backCamera = devices.find(device => {
        const label = device.label.toLowerCase();
        return label.includes('back') || 
               label.includes('rear') || 
               label.includes('environment') ||
               label.includes('facing back');
      });

      if (backCamera) {
        console.log('Found back camera:', backCamera.label);
        constraints.video = {
          deviceId: { exact: backCamera.deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        };
      } else {
        console.log('No back camera found by label, trying facingMode');
        constraints.video = {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        };
      }
    } else {
      // Fallback for single camera or when enumeration fails
      constraints.video = {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      };
    }

    statusEl.textContent = 'Requesting camera access...';
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    webcam.srcObject = currentStream;

    // Wait for video metadata to load
    await new Promise((resolve) => {
      webcam.onloadedmetadata = () => {
        console.log(`Video dimensions: ${webcam.videoWidth}x${webcam.videoHeight}`);
        resolve();
      };
    });

    // Set canvas size to match video
    canvas.width = webcam.videoWidth;
    canvas.height = webcam.videoHeight;
    
    // Apply canvas styling to maintain aspect ratio
    const maxWidth = Math.min(window.innerWidth - 40, 800);
    const aspectRatio = webcam.videoHeight / webcam.videoWidth;
    canvas.style.width = `${maxWidth}px`;
    canvas.style.height = `${maxWidth * aspectRatio}px`;

    statusEl.textContent = 'Camera setup complete';
    return true;

  } catch (error) {
    console.error('Camera setup failed:', error);
    
    // Try fallback with basic constraints
    try {
      statusEl.textContent = 'Trying fallback camera...';
      currentStream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: false 
      });
      webcam.srcObject = currentStream;
      
      await new Promise((resolve) => {
        webcam.onloadedmetadata = resolve;
      });
      
      canvas.width = webcam.videoWidth;
      canvas.height = webcam.videoHeight;
      
      statusEl.textContent = 'Using fallback camera';
      return true;
      
    } catch (fallbackError) {
      console.error('All camera attempts failed:', fallbackError);
      statusEl.textContent = 'Camera access failed. Please allow camera permissions and refresh.';
      return false;
    }
  }
}

// --------------------- Drawing Functions ---------------------
function drawDetections(boxes, scores, classes) {
  // Clear canvas and draw current video frame
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
  
  if (boxes.length === 0) return;

  // Set drawing style
  ctx.lineWidth = 3;
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.textBaseline = 'top';

  for (let i = 0; i < boxes.length; i++) {
    const [ymin, xmin, ymax, xmax] = boxes[i];
    
    // Ensure coordinates are within canvas bounds
    const x = Math.max(0, Math.min(xmin, canvas.width));
    const y = Math.max(0, Math.min(ymin, canvas.height));
    const w = Math.max(0, Math.min(xmax - x, canvas.width - x));
    const h = Math.max(0, Math.min(ymax - y, canvas.height - y));

    // Skip if box is too small
    if (w < 10 || h < 10) continue;

    const className = COCO_CLASSES[classes[i]] || `Class ${classes[i]}`;
    const confidence = (scores[i] * 100).toFixed(1);
    const label = `${className} ${confidence}%`;

    // Generate distinct color for each class
    const hue = (classes[i] * 137.508) % 360;
    const boxColor = `hsl(${hue}, 70%, 50%)`;
    const textColor = 'white';
    const bgColor = `hsl(${hue}, 70%, 40%)`;

    // Draw bounding box
    ctx.strokeStyle = boxColor;
    ctx.strokeRect(x, y, w, h);

    // Measure text for background
    const textMetrics = ctx.measureText(label);
    const textWidth = textMetrics.width;
    const textHeight = 20;
    const padding = 4;

    // Draw text background
    ctx.fillStyle = bgColor;
    ctx.fillRect(x, y - textHeight - padding, textWidth + padding * 2, textHeight + padding);

    // Draw text
    ctx.fillStyle = textColor;
    ctx.fillText(label, x + padding, y - textHeight);
  }

  // Draw detection info
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(5, 5, 200, 30);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 14px Arial';
  ctx.fillText(`Detections: ${boxes.length}`, 10, 20);
}

// --------------------- NMS Functions ---------------------
function intersectionOverUnion(boxA, boxB) {
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
  
  const unionArea = boxAArea + boxBArea - intersectArea;
  
  return unionArea > 0 ? intersectArea / unionArea : 0;
}

function nonMaxSuppression(boxes, scores, iouThreshold = 0.4) {
  const indices = Array.from({ length: scores.length }, (_, i) => i);
  
  // Sort by confidence score (descending)
  indices.sort((a, b) => scores[b] - scores[a]);
  
  const selected = [];
  
  while (indices.length > 0) {
    const current = indices.shift();
    selected.push(current);
    
    // Remove boxes with IoU > threshold
    const remaining = [];
    for (const idx of indices) {
      if (intersectionOverUnion(boxes[current], boxes[idx]) <= iouThreshold) {
        remaining.push(idx);
      }
    }
    indices.length = 0;
    indices.push(...remaining);
  }
  
  return selected;
}

// --------------------- Detection Loop ---------------------
async function detectLoop() {
  if (!isDetecting || !model) return;

  try {
    // Prepare input tensor
    const input = tf.tidy(() => {
      const tensor = tf.browser.fromPixels(webcam)
        .resizeBilinear([640, 640])
        .div(255.0)
        .expandDims(0);
      return tensor;
    });

    // Run inference
    let predictions;
    try {
      predictions = await model.executeAsync(input);
    } catch (e) {
      predictions = model.execute(input);
    }

    // Handle model output format
    let outputs = predictions;
    if (Array.isArray(predictions)) {
      outputs = predictions[0]; // Take first output if multiple
    }

    // Get prediction data
    let predictionData;
    if (outputs.shape.length === 3) {
      predictionData = await outputs.data();
      predictionData = Array.from(predictionData);
      // Reshape from flat array to [numPredictions, 85]
      const numPredictions = outputs.shape[1];
      const numClasses = outputs.shape[2];
      const reshapedData = [];
      for (let i = 0; i < numPredictions; i++) {
        const start = i * numClasses;
        const end = start + numClasses;
        reshapedData.push(predictionData.slice(start, end));
      }
      predictionData = reshapedData;
    } else {
      predictionData = await outputs.arraySync();
    }

    // Process detections
    const boxes = [];
    const scores = [];
    const classes = [];
    const confThreshold = Number(thresh.value);
    
    const scaleX = canvas.width / 640;
    const scaleY = canvas.height / 640;

    for (const detection of predictionData) {
      if (detection.length < 85) continue;
      
      const [centerX, centerY, width, height, objectness, ...classScores] = detection;
      
      // Find best class
      let maxClassScore = -1;
      let bestClassIndex = -1;
      for (let i = 0; i < classScores.length && i < 80; i++) {
        if (classScores[i] > maxClassScore) {
          maxClassScore = classScores[i];
          bestClassIndex = i;
        }
      }
      
      // Calculate final confidence
      const confidence = objectness * maxClassScore;
      
      if (confidence < confThreshold) continue;
      
      // Convert center format to corner format and scale
      const x1 = (centerX - width / 2) * scaleX;
      const y1 = (centerY - height / 2) * scaleY;
      const x2 = (centerX + width / 2) * scaleX;
      const y2 = (centerY + height / 2) * scaleY;
      
      boxes.push([y1, x1, y2, x2]);
      scores.push(confidence);
      classes.push(bestClassIndex);
    }

    // Apply Non-Maximum Suppression
    const selectedIndices = nonMaxSuppression(boxes, scores, 0.4);
    
    // Draw results
    const filteredBoxes = selectedIndices.map(i => boxes[i]);
    const filteredScores = selectedIndices.map(i => scores[i]);
    const filteredClasses = selectedIndices.map(i => classes[i]);
    
    drawDetections(filteredBoxes, filteredScores, filteredClasses);

    // Cleanup tensors
    input.dispose();
    if (Array.isArray(predictions)) {
      predictions.forEach(tensor => tensor.dispose());
    } else {
      predictions.dispose();
    }

  } catch (error) {
    console.error('Detection error:', error);
    statusEl.textContent = 'Detection error - check console';
  }

  // Continue loop
  if (isDetecting) {
    animationId = requestAnimationFrame(detectLoop);
  }
}

// --------------------- Initialization ---------------------
async function initializeApp() {
  try {
    statusEl.textContent = 'Setting up camera...';
    
    // Setup camera
    const cameraSuccess = await setupCamera();
    if (!cameraSuccess) {
      return;
    }

    statusEl.textContent = 'Loading YOLO model...';
    
    // Load model
    model = await tf.loadGraphModel(MODEL_URL);
    console.log('Model loaded successfully');
    
    // Warm up the model with a dummy prediction
    const dummyInput = tf.zeros([1, 640, 640, 3]);
    try {
      const warmupResult = await model.executeAsync(dummyInput);
      if (Array.isArray(warmupResult)) {
        warmupResult.forEach(tensor => tensor.dispose());
      } else {
        warmupResult.dispose();
      }
    } catch (e) {
      console.log('Model warmup with executeAsync failed, trying execute');
      const warmupResult = model.execute(dummyInput);
      if (Array.isArray(warmupResult)) {
        warmupResult.forEach(tensor => tensor.dispose());
      } else {
        warmupResult.dispose();
      }
    }
    dummyInput.dispose();

    statusEl.textContent = 'Starting detection...';
    isDetecting = true;
    detectLoop();
    
    statusEl.textContent = 'Detection active';
    
  } catch (error) {
    console.error('Initialization failed:', error);
    statusEl.textContent = `Error: ${error.message}`;
  }
}

// --------------------- Start Application ---------------------
// Wait for page to load completely
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
