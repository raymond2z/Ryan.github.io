let serial;
let val1 = 0;
let val2 = 0;
let timerStart = false;
let startTime = 0;
let elapsedTime = 0;
let finalTime = 0;
let resetButton;

function setup() {
  createCanvas(400, 400);
  textSize(32);
  textAlign(CENTER, CENTER);
  // Set up serial communication with Arduino
  serial = new p5.SerialPort();
  serial.open('COM6');
  serial.on('data', serialEvent);
  // Create reset button
  resetButton = createButton('Reset');
  resetButton.position(width/2 - resetButton.width/2, height - 50);
  resetButton.mousePressed(resetTimer);
}

function draw() {
  background(220);
  // Display values from the two detectors
  text(`Detector 1: ${val1}`, width/2, height/3);
  text(`Detector 2: ${val2}`, width/2, 2*height/3);
  // Display the elapsed time
  let currentTime = timerStart ? millis() - startTime : 0;
  finalTime = elapsedTime + currentTime;
  let minutes = floor(finalTime / 60000);
  let seconds = floor((finalTime % 60000) / 1000);
  let milliseconds = floor((finalTime % 1000) / 10);
  text(`${nf(minutes, 2)}:${nf(seconds, 2)}:${nf(milliseconds, 2)}`, width / 2, height / 2);
}

function serialEvent() {
  // Read data from Arduino
  let message = serial.readStringUntil('\r\n');
  if (message != null) {
    let values = message.split(',');
    if (values.length == 2) {
      // Parse values from detectors
      val1 = int(values[0]);
      val2 = int(values[1]);
      // Start or stop timer based on detector signals
      if (val1 == 1 && val2 == 0 && !timerStart) {
        timerStart = true;
        startTime = millis();
      } else if (val1 == 0 && val2 == 1 && timerStart) {
        elapsedTime += millis() - startTime;
        timerStart = false;
        startTime = 0;
      }
    }
  }
}

function resetTimer() {
  // Reset the stopwatch
  timerStart = false;
  startTime = 0;
  elapsedTime = 0;
  finalTime = 0;
}

function keyPressed() {
  // Reset the stopwatch when spacebar key is pressed
  if (key == ' ' || key == 'Spacebar') {
    resetTimer();
  }
}
