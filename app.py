from flask import Flask, render_template, request, redirect, url_for, session
import uuid, base64, qrcode, random, threading
from threading import Event
from io import BytesIO
from flask_socketio import SocketIO, emit, join_room

app = Flask(__name__)
app.secret_key = 'mysecretkey123'
socketio = SocketIO(app)

wheel_sessions = {}
last_random_participants = {}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/create', methods=['POST'])
def create():
    items = request.form['items'].split('\n')
    session_code = str(uuid.uuid4())
    wheel_sessions[session_code] = {
        'items': items,
        'participants': []
    }
    return redirect(url_for('name_input', session_code=session_code))

@app.route('/name/<session_code>', methods=['GET', 'POST'])
def name_input(session_code):
    if session_code not in wheel_sessions:
        wheel_sessions[session_code] = {'items': [], 'participants': []}

    if request.method == 'POST':
        user_name = request.form['name']
        session['user_name'] = user_name
        return redirect(url_for('wheel', session_code=session_code))

    return render_template('name_input.html', session_code=session_code)

@app.route('/wheel/<session_code>')
def wheel(session_code):
    session_data = wheel_sessions.get(session_code, {})
    items = session_data.get('items', [])
    participants = session_data.get('participants', [])
    user_name = session.get('user_name', 'Anonymous')

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(f"{request.host_url}name/{session_code}")
    qr.make(fit=True)
    img = qr.make_image(fill='black', back_color='white')

    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()

    return render_template(
        'wheel.html',
        session_code=session_code,
        items=items,
        qr_code=img_str,
        participants=participants,
        user_name=user_name
    )

@socketio.on('join_room')
def handle_join_room(data):
    session_code = data['session_code']
    user_name = data['user_name']

    if session_code not in wheel_sessions:
        wheel_sessions[session_code] = {'items': [], 'participants': []}

    if not any(p['name'] == user_name for p in wheel_sessions[session_code]['participants']):
        wheel_sessions[session_code]['participants'].append({
            'name': user_name,
            'sid': request.sid
        })

    join_room(session_code)

    socketio.emit('update_participants', {
        'participants': [p['name'] for p in wheel_sessions[session_code]['participants']]
    }, room=session_code)

@socketio.on('disconnect')
def handle_disconnect():
    session_code = None
    user_name = None

    for code, session_data in wheel_sessions.items():
        for participant in session_data['participants']:
            if participant['sid'] == request.sid:
                session_code = code
                user_name = participant['name']
                break
        if session_code:
            break

    if session_code and user_name:
        wheel_sessions[session_code]['participants'] = [
            p for p in wheel_sessions[session_code]['participants'] if p['sid'] != request.sid
        ]

        socketio.emit('update_participants', {
            'participants': [p['name'] for p in wheel_sessions[session_code]['participants']]
        }, room=session_code)

@socketio.on('spin')
def handle_spin(data):
    session_code = data['session_code']
    if session_code in wheel_sessions:
        participants = wheel_sessions[session_code].get('participants', [])
        if participants:
            random_participant = random.choice(participants)['name']
        else:
            random_participant = "No participants"
        emit('spin', {
            'speed': data['speed'],
            'random_participant': random_participant
        }, room=session_code)

def background_random_participant_cycle(session_code, stop_event):
    while not stop_event.is_set():
        update_random_participant(session_code)
        random_interval = random.randint(30, 90)
        stop_event.wait(random_interval)

def update_random_participant(session_code):
    if session_code in wheel_sessions:
        participants = wheel_sessions[session_code].get('participants', [])
        if not participants:
            return
        
        current_participant = last_random_participants.get(session_code, None)
        new_participant = random.choice(participants)
        while new_participant == current_participant:
            new_participant = random.choice(participants)
        
        last_random_participants[session_code] = new_participant

        socketio.emit('random_participant_update', {
            'random_participant': new_participant['name']
        }, room=session_code)

@socketio.on('start_random_cycle')
def handle_start_random_cycle(data):
    session_code = data['session_code']
    stop_event = Event()
    threading.Thread(target=background_random_participant_cycle, args=(session_code, stop_event)).start()
    wheel_sessions[session_code]['stop_event'] = stop_event


@socketio.on('winner_removed')
def handle_winner_removed(data):
    emit('remove_winner', room=data['session_code'])

if __name__ == "__main__":
    socketio.run(app, debug=True)