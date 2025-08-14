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

// --------------------- Mobile Detection ---------------------
function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// --------------------- Event Listeners ---------------------
thresh.addEventListener('input', () => {
  threshVal.textContent = Number(thresh.value).toFixed(2);
});

// Add click handler for iOS - sometimes requires user interaction
document.addEventListener('click', async () => {
  if (!currentStream && webcam.srcObject === null) {
    console.log('User clicked - attempting camera access');
    await setupCamera();
  }
}, { once: true });

// --------------------- Camera Functions ---------------------
async function setupCamera() {
  statusEl.textContent = 'Requesting camera access...';
  
  // Stop any existing stream
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }

  const mobile = isMobile();
  console.log('Device is mobile:', mobile);

  // Mobile-optimized constraints
  const mobileConstraints = {
    video: {
      facingMode: { exact: "environment" }, // Force back camera
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 }
    },
    audio: false
  };

  const fallbackConstraints = [
    // Try back camera with exact facingMode
    {
      video: { facingMode: { exact: "environment" } },
      audio: false
    },
    // Try back camera with ideal facingMode
    {
      video: { facingMode: { ideal: "environment" } },
      audio: false
    },
    // Try front camera as fallback
    {
      video: { facingMode: "user" },
      audio: false
    },
    // Basic video request
    {
      video: true,
      audio: false
    },
    // Very basic request with lower resolution
    {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    }
  ];

  // Add mobile constraints to the beginning
  if (mobile) {
    fallbackConstraints.unshift(mobileConstraints);
  }

  for (let i = 0; i < fallbackConstraints.length; i++) {
    const constraints = fallbackConstraints[i];
    console.log(`Trying camera constraint ${i + 1}:`, constraints);
    statusEl.textContent = `Trying camera option ${i + 1}...`;

    try {
      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (currentStream && currentStream.getVideoTracks().length > 0) {
        const videoTrack = currentStream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        console.log('Camera settings:', settings);
        console.log('Camera facing mode:', settings.facingMode);
        
        webcam.srcObject = currentStream;
        
        // Wait for video to be ready
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Video load timeout'));
          }, 10000);
          
          webcam.addEventListener('loadeddata', () => {
            clearTimeout(timeout);
            console.log(`Video ready: ${webcam.videoWidth}x${webcam.videoHeight}`);
            resolve();
          }, { once: true });
          
          webcam.addEventListener('error', (e) => {
            clearTimeout(timeout);
            reject(e);
          }, { once: true });
          
          // Force play on mobile
          webcam.play().catch(console.warn);
        });

        // Setup canvas
        canvas.width = webcam.videoWidth;
        canvas.height = webcam.videoHeight;
        
        // Make canvas responsive on mobile
        const maxWidth = Math.min(window.innerWidth - 20, 800);
        const aspectRatio = canvas.height / canvas.width;
        canvas.style.width = `${maxWidth}px`;
        canvas.style.height = `${maxWidth * aspectRatio}px`;
        
        statusEl.textContent = `Camera active: ${settings.facingMode || 'unknown'} facing`;
        
        // Test drawing video frame
        drawVideoFrame();
        
        return true;
      }
      
    } catch (error) {
      console.log(`Camera constraint ${i + 1} failed:`, error.message);
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
      }
    }
  }

  statusEl.textContent = 'Camera access failed. Please check permissions.';
  return false;
}

function drawVideoFrame() {
  if (webcam.videoWidth > 0 && webcam.videoHeight > 0) {
    ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
    
    // Draw status overlay
    ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
    ctx.fillRect(10, 10, 200, 40);
    ctx.fillStyle = 'black';
    ctx.font = 'bold 16px Arial';
    ctx.fillText('Camera Active!', 15, 30);
    
    console.log('Video frame drawn successfully');
  } else {
    console.log('Video not ready yet');
    setTimeout(drawVideoFrame, 100);
  }
}

// --------------------- Drawing Functions ---------------------
function drawDetections(boxes, scores, classes) {
  // Always draw the video frame first
  if (webcam.videoWidth > 0) {
    ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
  }
  
  // Draw detection info
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(10, 10, 250, 30);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 14px Arial';
  ctx.fillText(`Detections: ${boxes.length} | FPS: ${getFPS()}`, 15, 28);
  
  if (boxes.length === 0) return;

  // Draw each detection with bright colors
  for (let i = 0; i < boxes.length; i++) {
    const [ymin, xmin, ymax, xmax] = boxes[i];
    
    const x = Math.max(0, xmin);
    const y = Math.max(0, ymin);
    const w = Math.min(canvas.width - x, xmax - xmin);
    const h = Math.min(canvas.height - y, ymax - ymin);

    if (w < 5 || h < 5) continue; // Skip tiny boxes

    const className = COCO_CLASSES[classes[i]] || `C${classes[i]}`;
    const confidence = Math.round(scores[i] * 100);
    const label = `${className} ${confidence}%`;

    // Bright colors for mobile visibility
    const colors = [
      '#FF0000', '#00FF00', '#0000FF', '#FFFF00', 
      '#FF00FF', '#00FFFF', '#FFA500', '#FF69B4'
    ];
    const color = colors[classes[i] % colors.length];

    // Thick bounding box for mobile
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);

    // Label with background
    ctx.font = 'bold 14px Arial';
    const textWidth = ctx.measureText(label).width;
    const padding = 4;

    ctx.fillStyle = color;
    ctx.fillRect(x, y - 25, textWidth + padding * 2, 25);
    
    ctx.fillStyle = 'white';
    ctx.fillText(label, x + padding, y - 8);
  }
}

// --------------------- FPS Counter ---------------------
let frameCount = 0;
let lastTime = Date.now();
let fps = 0;

function getFPS() {
  frameCount++;
  const now = Date.now();
  if (now - lastTime >= 1000) {
    fps = frameCount;
    frameCount = 0;
    lastTime = now;
  }
  return fps;
}

// --------------------- Model Processing ---------------------
function processModelOutput(output) {
  let predictions;
  
  if (Array.isArray(output)) {
    output = output[0];
  }
  
  if (output.shape.length === 3) {
    predictions = output.arraySync()[0];
  } else if (output.shape.length === 2) {
    predictions = output.arraySync();
  } else {
    console.warn('Unexpected output shape:', output.shape);
    return { boxes: [], scores: [], classes: [] };
  }

  const boxes = [];
  const scores = [];
  const classes = [];
  const confThreshold = Number(thresh.value);
  
  const scaleX = canvas.width / 640;
  const scaleY = canvas.height / 640;

  for (const pred of predictions) {
    if (!pred || pred.length < 85) continue;
    
    const [centerX, centerY, width, height, objectness, ...classScores] = pred;
    
    // Find best class
    let maxScore = -1;
    let bestClass = -1;
    
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
      
      boxes.push([y1, x1, y2, x2]);
      scores.push(finalConfidence);
      classes.push(bestClass);
    }
  }
  
  return { boxes, scores, classes };
}

// --------------------- NMS Function ---------------------
function nonMaxSuppression(boxes, scores, iouThreshold = 0.4) {
  if (boxes.length === 0) return [];
  
  const indices = scores.map((score, index) => ({ score, index }))
                         .sort((a, b) => b.score - a.score)
                         .map(item => item.index);
  
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
  if (!isDetecting || !model) {
    requestAnimationFrame(detectLoop);
    return;
  }

  // Check if video is ready
  if (!webcam.videoWidth || webcam.paused || webcam.ended) {
    // Just draw video frame without detection
    if (webcam.videoWidth > 0) {
      ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
      ctx.fillRect(10, 10, 200, 30);
      ctx.fillStyle = 'black';
      ctx.font = 'bold 14px Arial';
      ctx.fillText('Loading model...', 15, 28);
    }
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

    // Run inference
    let output;
    try {
      output = await model.executeAsync(input);
    } catch (e) {
      output = model.execute(input);
    }

    // Process results
    const { boxes, scores, classes } = processModelOutput(output);
    const selectedIndices = nonMaxSuppression(boxes, scores, 0.4);
    
    const finalBoxes = selectedIndices.map(i => boxes[i]);
    const finalScores = selectedIndices.map(i => scores[i]);
    const finalClasses = selectedIndices.map(i => classes[i]);

    // Draw results
    drawDetections(finalBoxes, finalScores, finalClasses);

    // Cleanup
    input.dispose();
    if (Array.isArray(output)) {
      output.forEach(t => t.dispose());
    } else {
      output.dispose();
    }

  } catch (error) {
    console.error('Detection error:', error);
    // Draw error message
    ctx.fillStyle = 'red';
    ctx.fillRect(10, 10, 300, 40);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('Detection Error - Check Console', 15, 30);
  }

  requestAnimationFrame(detectLoop);
}

// --------------------- Initialization ---------------------
async function initializeApp() {
  try {
    statusEl.textContent = 'Initializing...';
    
    // Check TensorFlow
    if (typeof tf === 'undefined') {
      statusEl.textContent = 'TensorFlow.js not loaded';
      return;
    }
    
    console.log('TensorFlow.js version:', tf.version.tfjs);
    console.log('Mobile device:', isMobile());
    
    // Setup camera first
    statusEl.textContent = 'Setting up camera...';
    const cameraSuccess = await setupCamera();
    
    if (!cameraSuccess) {
      statusEl.textContent = 'Camera failed. Tap screen and allow permissions.';
      return;
    }

    // Load model
    statusEl.textContent = 'Loading AI model...';
    try {
      model = await tf.loadGraphModel(MODEL_URL);
      console.log('Model loaded successfully');
      
      // Warm up model
      const dummyInput = tf.zeros([1, 640, 640, 3]);
      const warmupOutput = await model.executeAsync(dummyInput);
      dummyInput.dispose();
      if (Array.isArray(warmupOutput)) {
        warmupOutput.forEach(t => t.dispose());
      } else {
        warmupOutput.dispose();
      }
      
    } catch (error) {
      console.error('Model loading failed:', error);
      statusEl.textContent = 'Model loading failed - check model files';
      return;
    }

    // Start detection
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
// Wait for page load and user interaction on mobile
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (isMobile()) {
      statusEl.textContent = 'Tap anywhere to start camera';
      document.addEventListener('touchstart', initializeApp, { once: true });
    } else {
      initializeApp();
    }
  });
} else {
  if (isMobile()) {
    statusEl.textContent = 'Tap anywhere to start camera';
    document.addEventListener('touchstart', initializeApp, { once: true });
  } else {
    initializeApp();
  }
}
