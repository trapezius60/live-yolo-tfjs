async function detectLoop() {
  const input = tf.tidy(() => {
    const frame = tf.browser.fromPixels(webcam);
    const resized = tf.image.resizeBilinear(frame, [640, 640]);
    const normalized = resized.div(255.0);
    return normalized.expandDims(0); // [1,640,640,3]
  });

  let output;
  try {
    output = await model.executeAsync(input);  // sometimes model.execute works
  } catch (e) {
    output = await model.execute(input);
  }

  // Output shape: [1, 84, 8400]
  const data = await output.data();
  const shape = output.shape; // e.g. [1, 84, 8400]
  const numClasses = 80; // COCO
  const numAnchors = shape[2]; 

  const boxesArr = [];
  const scoresArr = [];
  const classesArr = [];

  for (let i = 0; i < numAnchors; i++) {
    const offset = i * (numClasses + 4);

    // xywh
    const x = data[offset + 0];
    const y = data[offset + 1];
    const w = data[offset + 2];
    const h = data[offset + 3];

    // class scores
    let maxScore = -Infinity;
    let maxClass = -1;
    for (let c = 0; c < numClasses; c++) {
      const score = data[offset + 4 + c];
      if (score > maxScore) {
        maxScore = score;
        maxClass = c;
      }
    }

    if (maxScore > Number(thresh.value)) {
      // convert center x,y,w,h to ymin,xmin,ymax,xmax (normalized)
      const xmin = (x - w / 2) / 640;
      const ymin = (y - h / 2) / 640;
      const xmax = (x + w / 2) / 640;
      const ymax = (y + h / 2) / 640;

      boxesArr.push([ymin, xmin, ymax, xmax]);
      scoresArr.push(maxScore);
      classesArr.push(maxClass);
    }
  }

  drawDetections(boxesArr, scoresArr, classesArr, Number(thresh.value));

  tf.dispose([input, output]);
  await tf.nextFrame();
  requestAnimationFrame(detectLoop);
}
