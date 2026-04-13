import React, { useState, useRef, useEffect } from "react";
import "./App.css";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8001";
const API = `${BACKEND_URL}/api`;

const LANGUAGES = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "hi", name: "हिन्दी", flag: "🇮🇳" },
  { code: "ta", name: "தமிழ்", flag: "🇮🇳" },
];

function App() {
  const [inputText, setInputText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [sourceLang, setSourceLang] = useState("en");
  const [targetLang, setTargetLang] = useState("hi");
  const [isTranslating, setIsTranslating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const showMessage = (text, type = "info") => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: "", type: "" }), 4000);
  };

  const loadHistory = async () => {
    try {
      const response = await axios.get(`${API}/translation-history`);
      setHistory(response.data);
    } catch (error) {
      console.error("Failed to load history:", error);
    }
  };

  const handleTranslate = async () => {
    if (!inputText.trim()) {
      showMessage("Please enter text to translate", "error");
      return;
    }

    setIsTranslating(true);
    try {
      const response = await axios.post(`${API}/translate`, {
        text: inputText,
        source_lang: sourceLang,
        target_lang: targetLang,
      });

      setTranslatedText(response.data.translated_text);
      
      await axios.post(`${API}/translation-history`, {
        original_text: inputText,
        translated_text: response.data.translated_text,
        source_lang: sourceLang,
        target_lang: targetLang,
      });
      
      await loadHistory();
      showMessage("Translation complete!", "success");
    } catch (error) {
      console.error("Translation error:", error);
      showMessage("Translation failed. Please try again.", "error");
    } finally {
      setIsTranslating(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      showMessage("Recording started - speak now", "info");
    } catch (error) {
      console.error("Recording error:", error);
      showMessage("Failed to access microphone", "error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");
      formData.append("language", sourceLang);

      const response = await axios.post(`${API}/speech-to-text`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setInputText(response.data.text);
      showMessage("Transcription complete!", "success");
    } catch (error) {
      console.error("Transcription error:", error);
      showMessage("Transcription failed", "error");
    } finally {
      setIsTranscribing(false);
    }
  };

  const playAudio = async () => {
    if (!translatedText) {
      showMessage("No translation to play", "error");
      return;
    }

    setIsPlayingAudio(true);
    try {
      const response = await axios.post(
        `${API}/text-to-speech`,
        { text: translatedText, language: targetLang },
        { responseType: "blob" }
      );

      const audioUrl = URL.createObjectURL(response.data);
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        await audioRef.current.play();
        audioRef.current.onended = () => setIsPlayingAudio(false);
      }
    } catch (error) {
      console.error("Audio playback error:", error);
      showMessage("Failed to generate audio", "error");
      setIsPlayingAudio(false);
    }
  };

  const swapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setInputText(translatedText);
    setTranslatedText(inputText);
  };

  return (
    <div className="app-container">
      <audio ref={audioRef} style={{ display: "none" }} />
      
      {/* Toast Notification */}
      {message.text && (
        <div className={`toast toast-${message.type}`}>
          <div className="toast-content">
            {message.type === "success" && "✓"}
            {message.type === "error" && "✕"}
            {message.type === "info" && "ℹ"}
            <span>{message.text}</span>
          </div>
        </div>
      )}
      
      {/* Header */}
      <header className="header">
        <div className="header-container">
          <div className="logo-section">
            <div className="logo-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 8h14M5 12h14M5 16h14"/>
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5"/>
              </svg>
            </div>
            <div>
              <h1 className="logo-title">Indian Language Translator</h1>
              <p className="logo-subtitle">AI-Powered Neural Machine Translation</p>
            </div>
          </div>
          
          <button
            className="btn-secondary"
            onClick={() => setShowHistory(!showHistory)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            <span>History</span>
            {history.length > 0 && <span className="badge">{history.length}</span>}
          </button>
        </div>
      </header>

      <main className="main-content">
        {/* Language Selector */}
        <div className="language-selector-container">
          <div className="language-selector">
            <div className="select-wrapper">
              <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} className="language-select">
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name}
                  </option>
                ))}
              </select>
            </div>

            <button onClick={swapLanguages} className="swap-btn" title="Swap languages">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 16V4M7 4L3 8M7 4l4 4"/>
                <path d="M17 8v12m0 0l4-4m-4 4l-4-4"/>
              </svg>
            </button>

            <div className="select-wrapper">
              <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="language-select">
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Translation Panels */}
        <div className="translation-container">
          {/* Input Panel */}
          <div className="panel input-panel">
            <div className="panel-header">
              <h3 className="panel-title">Source Text</h3>
              <div className="panel-actions">
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isTranscribing}
                  className={`icon-btn ${isRecording ? "recording" : ""}`}
                  title={isRecording ? "Stop recording" : "Start recording"}
                >
                  {isTranscribing ? (
                    <div className="spinner"></div>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                      <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                  )}
                </button>
                {inputText && (
                  <button
                    onClick={() => { setInputText(""); setTranslatedText(""); }}
                    className="icon-btn"
                    title="Clear"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
            
            {isRecording && (
              <div className="recording-indicator">
                <div className="recording-dot"></div>
                <span>Recording in progress...</span>
              </div>
            )}
            
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type or speak to translate..."
              className="text-area"
              rows="8"
            />
            
            <div className="char-count">
              {inputText.length} characters
            </div>
          </div>

          {/* Output Panel */}
          <div className="panel output-panel">
            <div className="panel-header">
              <h3 className="panel-title">Translation</h3>
              <div className="panel-actions">
                <button
                  onClick={playAudio}
                  disabled={!translatedText || isPlayingAudio}
                  className="icon-btn"
                  title="Listen to translation"
                >
                  {isPlayingAudio ? (
                    <div className="spinner"></div>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(translatedText);
                    showMessage("Copied to clipboard!", "success");
                  }}
                  disabled={!translatedText}
                  className="icon-btn"
                  title="Copy translation"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="translation-output">
              {translatedText || <span className="placeholder">Translation will appear here...</span>}
            </div>
            
            {translatedText && (
              <div className="char-count">
                {translatedText.length} characters
              </div>
            )}
          </div>
        </div>

        {/* Translate Button */}
        <div className="translate-btn-container">
          <button
            onClick={handleTranslate}
            disabled={!inputText.trim() || isTranslating}
            className="btn-primary translate-btn"
          >
            {isTranslating ? (
              <>
                <div className="spinner"></div>
                <span>Translating...</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                  <path d="M11 8a2.5 2.5 0 0 1 0 5"/>
                </svg>
                <span>Translate</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              </>
            )}
          </button>
        </div>

        {/* History Panel */}
        {showHistory && (
          <div className="history-panel">
            <div className="panel-header">
              <h2 className="panel-title">Translation History</h2>
              <button onClick={() => setShowHistory(false)} className="icon-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            
            <div className="history-list">
              {history.length > 0 ? (
                history.map((item, index) => (
                  <div
                    key={item.id || index}
                    className="history-item"
                    onClick={() => {
                      setInputText(item.original_text);
                      setTranslatedText(item.translated_text);
                      setSourceLang(item.source_lang);
                      setTargetLang(item.target_lang);
                      setShowHistory(false);
                    }}
                  >
                    <div className="history-meta">
                      <span className="lang-pair">
                        {item.source_lang.toUpperCase()} → {item.target_lang.toUpperCase()}
                      </span>
                      <span className="history-time">
                        {new Date(item.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="history-text original">{item.original_text}</div>
                    <div className="history-text translated">{item.translated_text}</div>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v6l4 2"/>
                  </svg>
                  <p>No translation history yet</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <p>Powered by AI Neural Machine Translation</p>
          <p className="footer-tech">
            <span>Helsinki-NLP</span> • <span>Google Speech</span> • <span>Google TTS</span>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;