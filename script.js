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

// Create a button for camera access (better for mobile)
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
  
  // Stop any existing stream
  if (currentStream) {
    currentStream.getTracks().forEach(track => {
      track.stop();
      console.log('Stopped track:', track.label);
    });
    currentStream = null;
  }

  // Reset video element
  webcam.srcObject = null;
  cameraReady = false;

  console.log('🔍 Checking camera permissions...');
  
  // Check permissions first
  try {
    const permissions = await navigator.permissions.query({ name: 'camera' });
    console.log('Camera permission status:', permissions.state);
    
    permissions.onchange = () => {
      console.log('Permission changed to:', permissions.state);
    };
  } catch (e) {
    console.log('Permission API not supported');
  }

  // List available devices
  try {
    console.log('📱 Getting media devices...');
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    
    console.log(`Found ${videoDevices.length} video devices:`);
    videoDevices.forEach((device, index) => {
      console.log(`  ${index + 1}. ${device.label || 'Unknown Camera'} (ID: ${device.deviceId.slice(0, 10)}...)`);
    });

    if (videoDevices.length === 0) {
      statusEl.textContent = '❌ No cameras found';
      return false;
    }

  } catch (error) {
    console.error('Error enumerating devices:', error);
    statusEl.textContent = '❌ Cannot access media devices';
    return false;
  }

  // Try different camera configurations
  const configurations = [
    {
      name: 'Back camera (exact)',
      constraints: {
        video: { 
          facingMode: { exact: "environment" },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 }
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
      name: 'Front camera',
      constraints: {
        video: { facingMode: "user" },
        audio: false
      }
    },
    {
      name: 'Any camera (high res)',
      constraints: {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      }
    },
    {
      name: 'Any camera (medium res)',
      constraints: {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
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

  for (let i = 0; i < configurations.length; i++) {
    const config = configurations[i];
    console.log(`🔄 Trying: ${config.name}`);
    statusEl.textContent = `Trying: ${config.name}...`;
    
    try {
      console.log('Constraints:', JSON.stringify(config.constraints, null, 2));
      
      currentStream = await navigator.mediaDevices.getUserMedia(config.constraints);
      
      if (currentStream && currentStream.active) {
        const videoTracks = currentStream.getVideoTracks();
        console.log(`✅ SUCCESS! Got ${videoTracks.length} video track(s)`);
        
        if (videoTracks.length > 0) {
          const track = videoTracks[0];
          const settings = track.getSettings();
          const capabilities = track.getCapabilities();
          
          console.log('📹 Video track details:');
          console.log('  Label:', track.label);
          console.log('  Settings:', settings);
          console.log('  Capabilities:', capabilities);
          
          // Set up video element
          webcam.srcObject = currentStream;
          webcam.muted = true;
          webcam.playsInline = true;
          webcam.autoplay = true;
          
          // Wait for video to load
          const videoReady = await new Promise((resolve) => {
            const timeout = setTimeout(() => {
              console.log('⏰ Video load timeout');
              resolve(false);
            }, 15000); // 15 second timeout
            
            const onLoadedData = () => {
              clearTimeout(timeout);
              console.log(`📺 Video loaded: ${webcam.videoWidth}x${webcam.videoHeight}`);
              console.log('Video ready state:', webcam.readyState);
              console.log('Video current time:', webcam.currentTime);
              resolve(true);
            };
            
            const onError = (e) => {
              clearTimeout(timeout);
              console.error('Video error:', e);
              resolve(false);
            };

            // Try multiple events
            webcam.addEventListener('loadeddata', onLoadedData, { once: true });
            webcam.addEventListener('loadedmetadata', onLoadedData, { once: true });
            webcam.addEventListener('canplay', onLoadedData, { once: true });
            webcam.addEventListener('error', onError, { once: true });
            
            // Force play
            webcam.play().then(() => {
              console.log('📺 Video play() successful');
              // Give it a moment to start
              setTimeout(() => {
                if (webcam.videoWidth > 0) {
                  onLoadedData();
                }
              }, 1000);
            }).catch(e => {
              console.warn('Video play() failed:', e);
            });
          });

          if (videoReady && webcam.videoWidth > 0 && webcam.videoHeight > 0) {
            // Set up canvas
            canvas.width = webcam.videoWidth;
            canvas.height = webcam.videoHeight;
            
            console.log(`🎯 Canvas set to: ${canvas.width}x${canvas.height}`);
            
            // Style canvas for mobile
            const maxWidth = Math.min(window.innerWidth - 20, 800);
            const aspectRatio = canvas.height / canvas.width;
            canvas.style.width = `${maxWidth}px`;
            canvas.style.height = `${maxWidth * aspectRatio}px`;
            
            cameraReady = true;
            statusEl.textContent = `✅ Camera ready: ${config.name}`;
            
            // Test video drawing
            testVideoDrawing();
            
            return true;
          } else {
            console.log('❌ Video not ready or invalid dimensions');
          }
        }
      }
      
    } catch (error) {
      console.log(`❌ ${config.name} failed:`, error.message);
    }
    
    // Clean up failed attempt
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      currentStream = null;
    }
  }

  statusEl.textContent = '❌ All camera attempts failed';
  return false;
}

function testVideoDrawing() {
  console.log('🧪 Testing video drawing...');
  
  if (!cameraReady || webcam.videoWidth === 0) {
    console.log('Video not ready for drawing test');
    return;
  }
  
  // Draw a few test frames
  let testCount = 0;
  const testInterval = setInterval(() => {
    try {
      ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
      
      // Draw test overlay
      ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
      ctx.fillRect(10, 10, 200, 40);
      ctx.fillStyle = 'black';
      ctx.font = 'bold 16px Arial';
      ctx.fillText(`Video Test ${testCount + 1}`, 15, 35);
      
      console.log(`✅ Video frame ${testCount + 1} drawn successfully`);
      testCount++;
      
      if (testCount >= 3) {
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
  // Only proceed if camera is ready
  if (!cameraReady || webcam.videoWidth === 0) {
    // Draw black canvas with message
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Camera Not Ready', canvas.width / 2, canvas.height / 2);
    ctx.textAlign = 'left';
    return;
  }

  // Draw video frame
  try {
    ctx.drawImage(webcam, 0, 0, canvas.width, canvas.height);
  } catch (error) {
    console.error('Error drawing video frame:', error);
    return;
  }
  
  // Draw detection info
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(10, 10, 350, 50);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 12px Arial';
  ctx.fillText(`Objects detected: ${boxes.length}`, 15, 25);
  ctx.fillText(`Canvas: ${canvas.width}x${canvas.height}`, 15, 40);
  ctx.fillText(`Video: ${webcam.videoWidth}x${webcam.videoHeight}`, 15, 55);
  
  if (boxes.length === 0) return;

  // Calculate actual display scaling
  const canvasRect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / canvasRect.width;
  const scaleY = canvas.height / canvasRect.height;
  
  console.log('Canvas actual size:', canvas.width, 'x', canvas.height);
  console.log('Canvas display size:', canvasRect.width, 'x', canvasRect.height);
  console.log('Display scaling factors:', scaleX, scaleY);

  // Draw detections with bright colors
  for (let i = 0; i < boxes.length; i++) {
    const [ymin, xmin, ymax, xmax] = boxes[i];
    
    console.log(`Detection ${i} original coords:`, { ymin, xmin, ymax, xmax });
    
    // Use coordinates directly (they should already be scaled to canvas size)
    const x = Math.max(0, Math.min(xmin, canvas.width - 1));
    const y = Math.max(0, Math.min(ymin, canvas.height - 1));
    const w = Math.max(1, Math.min(xmax - x, canvas.width - x));
    const h = Math.max(1, Math.min(ymax - y, canvas.height - y));
    
    console.log(`Detection ${i} final coords:`, { x, y, w, h });

    const className = COCO_CLASSES[classes[i]] || `Class_${classes[i]}`;
    const confidence = Math.round(scores[i] * 100);
    const label = `${className} ${confidence}%`;

    const colors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#FF69B4'];
    const color = colors[classes[i] % colors.length];

    // Draw thick bounding box
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.strokeRect(x, y, w, h);
    
    // Draw corner markers for better visibility
    const markerSize = 20;
    ctx.fillStyle = color;
    // Top-left corner
    ctx.fillRect(x, y, markerSize, 3);
    ctx.fillRect(x, y, 3, markerSize);
    // Top-right corner
    ctx.fillRect(x + w - markerSize, y, markerSize, 3);
    ctx.fillRect(x + w - 3, y, 3, markerSize);
    // Bottom-left corner
    ctx.fillRect(x, y + h - 3, markerSize, 3);
    ctx.fillRect(x, y + h - markerSize, 3, markerSize);
    // Bottom-right corner
    ctx.fillRect(x + w - markerSize, y + h - 3, markerSize, 3);
    ctx.fillRect(x + w - 3, y + h - markerSize, 3, markerSize);

    // Label background
    ctx.font = 'bold 16px Arial';
    const textWidth = ctx.measureText(label).width;
    const padding = 6;
    const labelHeight = 24;

    // Position label above box, or below if too close to top
    const labelY = y > labelHeight + 10 ? y - labelHeight : y + h + labelHeight;

    ctx.fillStyle = color;
    ctx.fillRect(x, labelY - labelHeight + 4, textWidth + padding * 2, labelHeight);
    
    ctx.fillStyle = 'white';
    ctx.fillText(label, x + padding, labelY - 4);
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
    return { boxes: [], scores: [], classes: [] };
  }

  const boxes = [];
  const scores = [];
  const classes = [];
  const confThreshold = Number(thresh.value);
  
  // Scale coordinates from 640x640 model input to actual canvas size
  const scaleX = canvas.width / 640;
  const scaleY = canvas.height / 640;
  
  console.log(`Model output scaling: ${scaleX.toFixed(2)}x, ${scaleY.toFixed(2)}y (Canvas: ${canvas.width}x${canvas.height})`);

  let detectionCount = 0;
  
  for (const pred of predictions) {
    if (!pred || pred.length < 85) continue;
    
    const [centerX, centerY, width, height, objectness, ...classScores] = pred;
    
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
      // Convert from center format to corner format and scale to canvas
      const x1 = (centerX - width / 2) * scaleX;
      const y1 = (centerY - height / 2) * scaleY;
      const x2 = (centerX + width / 2) * scaleX;
      const y2 = (centerY + height / 2) * scaleY;
      
      // Clamp coordinates to canvas bounds
      const clampedX1 = Math.max(0, Math.min(x1, canvas.width));
      const clampedY1 = Math.max(0, Math.min(y1, canvas.height));
      const clampedX2 = Math.max(clampedX1, Math.min(x2, canvas.width));
      const clampedY2 = Math.max(clampedY1, Math.min(y2, canvas.height));
      
      console.log(`Detection ${detectionCount}: ${COCO_CLASSES[bestClass]} (${(finalConfidence*100).toFixed(1)}%)`);
      console.log(`  Model coords: center=(${centerX.toFixed(1)}, ${centerY.toFixed(1)}), size=(${width.toFixed(1)}, ${height.toFixed(1)})`);
      console.log(`  Canvas coords: (${clampedX1.toFixed(1)}, ${clampedY1.toFixed(1)}) to (${clampedX2.toFixed(1)}, ${clampedY2.toFixed(1)})`);
      
      boxes.push([clampedY1, clampedX1, clampedY2, clampedX2]);
      scores.push(finalConfidence);
      classes.push(bestClass);
      detectionCount++;
    }
  }
  
  console.log(`Total detections above threshold: ${detectionCount}`);
  
  return { boxes, scores, classes };
}

// --------------------- Detection Loop ---------------------
async function detectLoop() {
  if (!isDetecting || !model) {
    requestAnimationFrame(detectLoop);
    return;
  }

  try {
    // Only run detection if camera is ready
    if (cameraReady && webcam.videoWidth > 0) {
      const input = tf.tidy(() => {
        return tf.browser.fromPixels(webcam)
          .resizeBilinear([640, 640])
          .div(255.0)
          .expandDims(0);
      });

      let output;
      try {
        output = await model.executeAsync(input);
      } catch (e) {
        output = model.execute(input);
      }

      const { boxes, scores, classes } = processModelOutput(output);
      drawDetections(boxes, scores, classes);

      input.dispose();
      if (Array.isArray(output)) {
        output.forEach(t => t.dispose());
      } else {
        output.dispose();
      }
    } else {
      // Just draw "camera not ready" message
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
    
    // Check TensorFlow
    if (typeof tf === 'undefined') {
      statusEl.textContent = 'TensorFlow.js not loaded';
      return;
    }
    
    console.log('✅ TensorFlow.js version:', tf.version.tfjs);

    // Load model first (without camera)
    statusEl.textContent = 'Loading AI model...';
    try {
      model = await tf.loadGraphModel(MODEL_URL);
      console.log('✅ Model loaded successfully');
      
      // Model warmup
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

    // Set up canvas with default size
    canvas.width = 640;
    canvas.height = 480;
    
    // Start detection loop (will show "camera not ready" until camera works)
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
