# 🌐 Indian Language Translator

AI-powered translation system supporting English, Hindi, and Tamil with speech and text capabilities.

---

## ✨ Features

- Bidirectional translation: English ↔ Hindi ↔ Tamil
- Speech-to-Text (Google Speech Recognition)
- Text-to-Speech (Google TTS)
- Translation history (MongoDB)
- Custom fine-tuned MarianMT model support

---

## 🏗️ Tech Stack

| Layer | Tools |
|-------|-------|
| Backend | FastAPI, Python |
| Frontend | React 18 |
| Database | MongoDB |
| ML Models | MarianMT (custom) |
| Speech | Google Speech API, gTTS |

---

## 🚀 Setup

### Prerequisites
- Python 3.8+, Node.js 14+, MongoDB, FFmpeg

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env`:
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=translator_database
CUSTOM_EN_HI_MODEL=path/to/checkpoint-122000  # optional
```

### Frontend
```bash
cd frontend
npm install
```

Create `frontend/.env`:
```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

---

## ▶️ Running

```bash
# Backend
uvicorn server:app --reload --host 0.0.0.0 --port 8001

# Frontend
npm start
```

- Frontend: http://localhost:3000
- API docs: http://localhost:8001/docs

---

## 📡 Key API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/translate` | Translate text |
| POST | `/api/speech-to-text` | Audio → text |
| POST | `/api/text-to-speech` | Text → audio |
| GET | `/api/translation-history` | View history |

---

## 📝 Notes

- Models download automatically on first run (~1–5 min)
- Translation runs locally after initial download
- Speech features require an internet connection

---

*MIT License · Made with ❤️ using open source AI*
