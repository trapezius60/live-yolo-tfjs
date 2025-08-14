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
let cameraReady = false;

// --------------------- Event Listeners ---------------------
thresh.addEventListener('input', () => {
  threshVal.textContent = Number(thresh.value).toFixed(2);
});

// Create a button for camera access
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

// --------------------- Camera Functions ---------------------
async function startCamera() {
  statusEl.textContent = '🎥 Starting camera...';
  
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }

  webcam.srcObject = null;
  cameraReady = false;

  const configurations = [
    {
      name: 'Back camera (exact)',
      constraints: {
        video: { 
          facingMode: { exact: "environment" },
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 }
        },
        audio: false
      }
    },
    {
      name: 'Back camera (ideal)',
      constraints: {
        video: { 
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      }
    },
    {
      name: 'Any back camera',
      constraints: {
        video: { facingMode: "environment" },
        audio: false
      }
    },
    {
      name: 'Basic camera',
      constraints: {
        video: true,
        audio: false
      }
    }
  ];

  for (const config of configurations) {
    console.log(`🔄 Trying: ${config.name}`);
    statusEl.textContent = `Trying: ${config.name}...`;
    
    try {
      currentStream = await navigator.mediaDevices.getUserMedia(config.constraints);
      
      if (currentStream && currentStream.active) {
        const videoTracks = currentStream.getVideoTracks();
        
        if (videoTracks.length > 0) {
          const track = videoTracks[0];
          const settings = track.getSettings();
          
          console.log('📹 Camera settings:', settings);
          
          webcam.srcObject = currentStream;
          webcam.muted = true;
          webcam.playsInline = true;
          webcam.autoplay = true;
          
          const videoReady = await new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(false), 10000);
            
            const onReady = () => {
              clearTimeout(timeout);
              console.log(`📺 Video ready: ${webcam.videoWidth}x${webcam.videoHeight}`);
              resolve(true);
            };
            
            webcam.addEventListener('loadeddata', onReady, { once: true });
            webcam.addEventListener('canplay', onReady, { once: true });
            
            webcam.play().catch(console.warn);
          });

          if (videoReady && webcam.videoWidth > 0 && webcam.videoHeight > 0) {
            setupCanvas();
            cameraReady = true;
            statusEl.textContent = `✅ Camera ready: ${config.name}`;
            testVideoDrawing();
            return true;
          }
        }
      }
      
    } catch (error) {
      console.log(`❌ ${config.name} failed:`, error.message);
    }
    
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      currentStream = null;
    }
  }

  statusEl.textContent = '❌ All camera attempts failed';
  return false;
}

function setupCanvas() {
  // IMPORTANT: Canvas size should match video dimensions exactly
  canvas.width = webcam.videoWidth;
  canvas.height = webcam.videoHeight;
  
  console.log(`🎯 Canvas set to match video: ${canvas.width}x${canvas.height}`);
  
  // Style canvas for responsive display while maintaining aspect ratio
  const maxWidth = Math.min(window.innerWidth - 20, 800);
  const aspectRatio = canvas.height / canvas.width;
  
  canvas.style.width = `${maxWidth}px`;
  canvas.style.height = `${maxWidth * aspectRatio}px`;
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';
  
  console.log(`📱 Canvas display styled: ${maxWidth}px x ${maxWidth * aspectRatio}px`);
}

function testVideoDrawing() {
  console.log('🧪 Testing video drawing...');
  
  let testCount = 0;
  const testInterval = setInterval(() => {
    if (!cameraReady || webcam.videoWidth === 0) {
      clearInterval(testInterval);
      return;
    }
    
    try {
      // Draw video frame
      ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
      
      // Draw test overlay
      ctx.fillStyle = 'rgba(0, 255, 0, 0.9)';
      ctx.fillRect(10, 10, 250, 60);
      ctx.fillStyle = 'black';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(`Video Test ${testCount + 1}`, 15, 30);
      ctx.fillText(`Canvas: ${canvas.width}x${canvas.height}`, 15, 45);
      ctx.fillText(`Video: ${webcam.videoWidth}x${webcam.videoHeight}`, 15, 60);
      
      // Draw center crosshair for reference
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(centerX - 50, centerY);
      ctx.lineTo(centerX + 50, centerY);
      ctx.moveTo(centerX, centerY - 50);
      ctx.lineTo(centerX, centerY + 50);
      ctx.stroke();
      
      console.log(`✅ Video frame ${testCount + 1} drawn successfully`);
      testCount++;
      
      if (testCount >= 5) {
        clearInterval(testInterval);
        console.log('🎉 Video drawing test completed successfully!');
      }
      
    } catch (error) {
      console.error('Video drawing test failed:', error);
      clearInterval(testInterval);
    }
  }, 1000);
}

// --------------------- Drawing Functions ---------------------
function drawDetections(boxes, scores, classes) {
  if (!cameraReady || webcam.videoWidth === 0) {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Camera Not Ready', canvas.width / 2, canvas.height / 2);
    ctx.textAlign = 'left';
    return;
  }

  // Draw video frame first
  ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
  
  // Draw debug info
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(10, 10, 320, 80);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 12px Arial';
  ctx.fillText(`Detections: ${boxes.length}`, 15, 25);
  ctx.fillText(`Canvas: ${canvas.width} x ${canvas.height}`, 15, 40);
  ctx.fillText(`Video: ${webcam.videoWidth} x ${webcam.videoHeight}`, 15, 55);
  ctx.fillText(`Threshold: ${thresh.value}`, 15, 70);
  ctx.fillText(`Camera: ${cameraReady ? 'Ready' : 'Not Ready'}`, 15, 85);
  
  // Draw center reference point
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  ctx.fillStyle = 'yellow';
  ctx.fillRect(centerX - 2, centerY - 2, 4, 4);
  ctx.font = 'bold 12px Arial';
  ctx.fillStyle = 'yellow';
  ctx.fillText(`Center: ${centerX.toFixed(0)}, ${centerY.toFixed(0)}`, centerX + 10, centerY - 10);
  
  if (boxes.length === 0) return;

  // Draw each detection
  for (let i = 0; i < boxes.length; i++) {
    const [ymin, xmin, ymax, xmax] = boxes[i];
    
    console.log(`Drawing detection ${i}:`, {
      coords: [ymin, xmin, ymax, xmax],
      class: COCO_CLASSES[classes[i]],
      confidence: (scores[i] * 100).toFixed(1) + '%'
    });
    
    // Ensure coordinates are within canvas
    const x = Math.max(0, Math.min(xmin, canvas.width - 1));
    const y = Math.max(0, Math.min(ymin, canvas.height - 1));
    const w = Math.max(1, Math.min(xmax - x, canvas.width - x));
    const h = Math.max(1, Math.min(ymax - y, canvas.height - y));

    const className = COCO_CLASSES[classes[i]] || `Unknown_${classes[i]}`;
    const confidence = Math.round(scores[i] * 100);
    const label = `${className} ${confidence}%`;

    // Use bright, distinct colors
    const colors = [
      '#FF0000', '#00FF00', '#0000FF', '#FFFF00', 
      '#FF00FF', '#00FFFF', '#FFA500', '#FF69B4',
      '#32CD32', '#FF4500', '#DA70D6', '#40E0D0'
    ];
    const color = colors[classes[i] % colors.length];

    // Draw very thick bounding box
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.strokeRect(x, y, w, h);
    
    // Draw filled corner markers
    const markerSize = 25;
    ctx.fillStyle = color;
    
    // Top-left
    ctx.fillRect(x, y, markerSize, 4);
    ctx.fillRect(x, y, 4, markerSize);
    
    // Top-right
    ctx.fillRect(x + w - markerSize, y, markerSize, 4);
    ctx.fillRect(x + w - 4, y, 4, markerSize);
    
    // Bottom-left
    ctx.fillRect(x, y + h - 4, markerSize, 4);
    ctx.fillRect(x, y + h - markerSize, 4, markerSize);
    
    // Bottom-right
    ctx.fillRect(x + w - markerSize, y + h - 4, markerSize, 4);
    ctx.fillRect(x + w - 4, y + h - markerSize, 4, markerSize);

    // Draw center dot
    const boxCenterX = x + w / 2;
    const boxCenterY = y + h / 2;
    ctx.fillStyle = color;
    ctx.fillRect(boxCenterX - 3, boxCenterY - 3, 6, 6);

    // Label with background
    ctx.font = 'bold 16px Arial';
    const textMetrics = ctx.measureText(label);
    const textWidth = textMetrics.width;
    const padding = 8;
    const labelHeight = 28;

    // Position label above box if possible, otherwise below
    let labelY;
    if (y > labelHeight + 10) {
      labelY = y - 4;
    } else {
      labelY = y + h + labelHeight;
    }

    // Label background
    ctx.fillStyle = color;
    ctx.fillRect(x, labelY - labelHeight + 4, textWidth + padding * 2, labelHeight);
    
    // Label text
    ctx.fillStyle = 'white';
    ctx.fillText(label, x + padding, labelY - 8);
    
    // Draw coordinate text for debugging
    ctx.fillStyle = 'white';
    ctx.font = 'bold 10px Arial';
    ctx.fillText(`(${x.toFixed(0)},${y.toFixed(0)})`, x, y - 8);
  }
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
  
  console.log(`🧠 Processing ${predictions.length} predictions`);
  console.log(`Canvas dimensions: ${canvas.width} x ${canvas.height}`);
  
  // CRITICAL: Scale from model's 640x640 input to actual canvas size
  const scaleX = canvas.width / 640;
  const scaleY = canvas.height / 640;
  
  console.log(`📐 Scaling factors: X=${scaleX.toFixed(3)}, Y=${scaleY.toFixed(3)}`);

  let validDetections = 0;
  
  for (let i = 0; i < predictions.length; i++) {
    const pred = predictions[i];
    
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
      // Convert from center format (model output) to corner format
      // Model outputs are in 0-640 coordinate space
      const x1 = (centerX - width / 2) * scaleX;
      const y1 = (centerY - height / 2) * scaleY;
      const x2 = (centerX + width / 2) * scaleX;
      const y2 = (centerY + height / 2) * scaleY;
      
      // Clamp to canvas bounds
      const clampedX1 = Math.max(0, Math.min(x1, canvas.width));
      const clampedY1 = Math.max(0, Math.min(y1, canvas.height));
      const clampedX2 = Math.max(clampedX1 + 1, Math.min(x2, canvas.width));
      const clampedY2 = Math.max(clampedY1 + 1, Math.min(y2, canvas.height));
      
      console.log(`✅ Detection ${validDetections}: ${COCO_CLASSES[bestClass]} (${(finalConfidence*100).toFixed(1)}%)`);
      console.log(`   Raw model: center=(${centerX.toFixed(1)}, ${centerY.toFixed(1)}), size=(${width.toFixed(1)} x ${height.toFixed(1)})`);
      console.log(`   Scaled canvas: (${clampedX1.toFixed(1)}, ${clampedY1.toFixed(1)}) to (${clampedX2.toFixed(1)}, ${clampedY2.toFixed(1)})`);
      console.log(`   Box size: ${(clampedX2-clampedX1).toFixed(1)} x ${(clampedY2-clampedY1).toFixed(1)}`);
      
      boxes.push([clampedY1, clampedX1, clampedY2, clampedX2]);
      scores.push(finalConfidence);
      classes.push(bestClass);
      validDetections++;
    }
  }
  
  console.log(`📊 Found ${validDetections} valid detections`);
  
  return { boxes, scores, classes };
}

// --------------------- Simple NMS ---------------------
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

  try {
    if (cameraReady && webcam.videoWidth > 0) {
      // Create input tensor - resize video to 640x640 for model
      const input = tf.tidy(() => {
        return tf.browser.fromPixels(webcam)
          .resizeBilinear([640, 640])  // Model expects 640x640
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
      
      // Apply NMS
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
    } else {
      drawDetections([], [], []);
    }

  } catch (error) {
    console.error('Detection error:', error);
  }

  requestAnimationFrame(detectLoop);
}

// --------------------- Initialization ---------------------
async function initializeApp() {
  try {
    console.log('🚀 Initializing app...');
    statusEl.textContent = 'Initializing...';
    
    if (typeof tf === 'undefined') {
      statusEl.textContent = 'TensorFlow.js not loaded';
      return;
    }
    
    console.log('✅ TensorFlow.js version:', tf.version.tfjs);

    statusEl.textContent = 'Loading AI model...';
    try {
      model = await tf.loadGraphModel(MODEL_URL);
      console.log('✅ Model loaded successfully');
      
      // Warmup
      const dummyInput = tf.zeros([1, 640, 640, 3]);
      const warmupOutput = await model.executeAsync(dummyInput);
      dummyInput.dispose();
      if (Array.isArray(warmupOutput)) {
        warmupOutput.forEach(t => t.dispose());
      } else {
        warmupOutput.dispose();
      }
      console.log('✅ Model warmed up');
      
    } catch (error) {
      console.error('❌ Model loading failed:', error);
      statusEl.textContent = 'Model loading failed';
      return;
    }

    // Set default canvas size
    canvas.width = 640;
    canvas.height = 480;
    
    // Start detection loop
    isDetecting = true;
    detectLoop();
    
    // Show camera button
    statusEl.textContent = 'Click button to start camera';
    createCameraButton();
    
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    statusEl.textContent = `Error: ${error.message}`;
  }
}

// --------------------- Start Application ---------------------
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
