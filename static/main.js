document.addEventListener("DOMContentLoaded", function () {
    createWheel();

    const socket = io.connect(window.location.origin);
    const sessionCode = window.sessionCode;
    const userName = window.userName;

    socket.emit('join_room', { session_code: sessionCode, user_name: userName });
    
    socket.on('spin', function (data) {
        startSpinning(data.speed);
    
        const randomParticipantDiv = document.getElementById("random-participant");
        randomParticipantDiv.textContent = `${data.random_participant}`;
        randomParticipantDiv.classList.remove("hidden");
    });

    socket.on('remove_winner', function () {
        const winnerWrapper = document.getElementById("winner-wrapper");
        winnerWrapper.classList.add("hidden");
    });

    socket.on('update_participants', function (data) {
        updateParticipantsList(data.participants);
    });
    
    document.querySelector('.spin').addEventListener('click', function () {
        const initialSpeed = Math.random() * 20 + 20;
        socket.emit('spin', { session_code: sessionCode, speed: initialSpeed });
    
        socket.emit('start_random_cycle', { session_code: sessionCode });
    });

    document.getElementById("participants-btn").addEventListener("click", function () {
        document.getElementById("participants-list").classList.remove("hidden")
    });
    
    document.getElementById("participants-list").addEventListener("click", function () {
        this.classList.add("hidden");
    });

    document.getElementById("winner-wrapper").addEventListener("click", function () {
        this.classList.add("hidden");

        socket.emit('winner_removed', { session_code: sessionCode });
    });

    function updateParticipantsList(participants) {
        const participantsList = document.getElementById("participants");
        participantsList.innerHTML = '';
    
        participants.forEach(function (name) {
            const li = document.createElement("li");
            li.textContent = name;
            participantsList.appendChild(li);
        });
    }

    socket.on('random_participant_update', function (data) {
        const randomParticipantDiv = document.getElementById("random-participant");
        randomParticipantDiv.textContent = `${data.random_participant}`;
        randomParticipantDiv.classList.remove("hidden");
    });
    
    function autoCloseWinnerWrapper() {
        const timerDisplay = document.getElementById('timer');
        const winnerWrapper = document.getElementById("winner-wrapper");

        if (timerDisplay.textContent === "Time's up!") {
            winnerWrapper.classList.add("hidden");
        }
    }
});



function toRad(deg) {
    return deg * (Math.PI / 180);
}


const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const width = canvas.width;
const height = canvas.height;
const centerX = width / 2;
const centerY = height / 2;
const radius = width / 2;
const segmentColors = [
    "#8dec26",
    "#3d28e5",
    "#e94126", 
    "#bad7ec", 
    "#ece7e1", 
    "#ffef01", 
];

function drawWheel(ctx, items, centerX, centerY, radius) {
    const step = 360 / items.length;
    let startDeg = 0;

    for (let i = 0; i < items.length; i++, startDeg += step) {
        let endDeg = startDeg + step;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, toRad(startDeg), toRad(endDeg));
        ctx.lineTo(centerX, centerY);
        ctx.fillStyle = segmentColors[i % segmentColors.length];
        ctx.fill();

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(toRad((startDeg + endDeg) / 2));
        ctx.textAlign = "center";
        ctx.fillStyle = "#000";
        ctx.font = 'bold 24px Trebuchet MS';
        ctx.fillText(items[i], radius / 2, 0);
        ctx.restore();
    }
}

function createWheel() {
    const items = document.getElementById("items").value.split("\n").filter(item => item.trim() !== "");
    ctx.clearRect(0, 0, width, height);
    drawWheel(ctx, items, centerX, centerY, radius);
}

let currentAngle = 0;
let speed = 0;
let spinning = false;
let winner = "";
let timerInterval;

function spin() {
    const initialSpeed = Math.random() * 20 + 20;
    socket.emit('spin', { speed: initialSpeed });
}

function startSpinning(initialSpeed) {
    if (spinning) {
        return;
    }

    speed = initialSpeed;
    spinning = true;
    requestAnimationFrame(animate);
}


function animate() {
    if (!spinning) return;

    currentAngle += speed;
    speed *= 0.98;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(toRad(currentAngle));
    ctx.translate(-centerX, -centerY);

    const items = document.getElementById("items").value.split("\n").filter(item => item.trim() !== "");
    drawWheel(ctx, items, centerX, centerY, radius);

    ctx.restore();

    if (speed < 0.01) {
        speed = 0;
        spinning = false;
        determineWinner(items, currentAngle);
    } else {
        requestAnimationFrame(animate);
    }
}

function determineWinner(items, angle) {
    const step = 360 / items.length;
    const normalizedAngle = (angle % 360 + 360) % 360;
    const winningIndex = Math.floor(normalizedAngle / step);
    winner = items[items.length - 1 - winningIndex];

    items.splice(items.length - 1 - winningIndex, 1);
    document.getElementById("items").value = items.join("\n");

    const winnerWrapper = document.getElementById("winner-wrapper");
    const winnerDiv = document.getElementById("winner");
    winnerDiv.textContent = `${winner}`;

    if (winnerWrapper) {
        winnerWrapper.classList.remove("hidden");
    }

    const spinButton = document.getElementById("spin-button");
    if (items.length === 0) {
        spinButton.disabled = true;
        spinButton.classList.add("disabled");
    }

    startCountdown(10 * 60);
    createWheel();
}


function startCountdown(duration) {
    let countdownTime = duration;
    clearInterval(timerInterval);

    timerInterval = setInterval(function() {
        const minutes = Math.floor(countdownTime / 60);
        const seconds = countdownTime % 60;

        const formattedMinutes = minutes < 10 ? "0" + minutes : minutes;
        const formattedSeconds = seconds < 10 ? "0" + seconds : seconds;

        document.getElementById('timer').textContent = formattedMinutes + ":" + formattedSeconds;

        countdownTime--;

        if (countdownTime < 0) {
            clearInterval(timerInterval);
            document.getElementById('timer').textContent = "Time's up!";
        }
    }, 1000);
}

document.getElementById("winner-wrapper").addEventListener("click", function() {
    this.classList.add("hidden");

    socket.emit('winner_removed');
});