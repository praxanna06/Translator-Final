from fastapi import FastAPI, APIRouter, File, UploadFile, HTTPException
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from transformers import MarianMTModel, MarianTokenizer, AutoModelForSeq2SeqLM, AutoTokenizer
import io
import tempfile
import speech_recognition as sr
from gtts import gTTS
from pydub import AudioSegment

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'translator_db')]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Translation models cache
translation_models = {}
translation_tokenizers = {}

# Initialize speech recognizer
recognizer = sr.Recognizer()

# ⭐ YOUR CUSTOM MODEL PATH
# Update this to your actual Google Drive path or local path
CUSTOM_EN_HI_MODEL_PATH = r"C:\Users\mpras\.cache\huggingface\hub\Marian-Model\checkpoint-122000"

# Model mappings
MODEL_MAPPINGS = {
    "en-hi": CUSTOM_EN_HI_MODEL_PATH,  # ✅ YOUR CUSTOM MarianMT MODEL
    "hi-en": "facebook/nllb-200-distilled-600M",
    "en-ta": "facebook/nllb-200-distilled-600M",
    "ta-en": "facebook/nllb-200-distilled-600M",
}

# Model types
MODEL_TYPES = {
    "en-hi": "marian",  # Your custom MarianMT model
    "hi-en": "nllb",
    "en-ta": "nllb",
    "ta-en": "nllb",
}

# Language codes for NLLB
NLLB_LANG_CODES = {
    "en": "eng_Latn",
    "hi": "hin_Deva",
    "ta": "tam_Taml"
}

GTTS_LANG_MAP = {"en": "en", "hi": "hi", "ta": "ta"}

def get_translation_model(model_key: str):
    """Load and cache translation models"""
    if model_key not in translation_models:
        model_path = MODEL_MAPPINGS[model_key]
        model_type = MODEL_TYPES[model_key]
        
        logger.info(f"Loading {model_type} model for {model_key}: {model_path}")
        
        try:
            if model_type == "marian":
                # Load your custom MarianMT model
                if not os.path.exists(model_path):
                    raise FileNotFoundError(f"Custom model not found at: {model_path}")
                
                logger.info(f"Loading custom MarianMT model from: {model_path}")
                
                # Load MarianMT model and tokenizer
                translation_models[model_key] = MarianMTModel.from_pretrained(
                    model_path,
                    local_files_only=True
                )
                translation_tokenizers[model_key] = MarianTokenizer.from_pretrained(
                    model_path,
                    local_files_only=True
                )
                
                logger.info(f"✅ Custom MarianMT model loaded successfully!")
                logger.info(f"   Model size: {os.path.getsize(os.path.join(model_path, 'model.safetensors')) / (1024*1024):.1f} MB")
                
            else:
                # Load NLLB model
                logger.info(f"Loading NLLB model from HuggingFace")
                translation_models[model_key] = AutoModelForSeq2SeqLM.from_pretrained(model_path)
                translation_tokenizers[model_key] = AutoTokenizer.from_pretrained(model_path)
                logger.info(f"✅ NLLB model loaded successfully!")
                
        except Exception as e:
            logger.error(f"Failed to load model: {str(e)}")
            raise
    
    return translation_models[model_key], translation_tokenizers[model_key]

# Models
class TranslateRequest(BaseModel):
    text: str
    source_lang: str
    target_lang: str

class TranslateResponse(BaseModel):
    translated_text: str
    source_lang: str
    target_lang: str
    original_text: str
    model_used: Optional[str] = None

class SpeechToTextResponse(BaseModel):
    text: str
    language: Optional[str] = None

class TextToSpeechRequest(BaseModel):
    text: str
    language: str

class TranslationHistory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    original_text: str
    translated_text: str
    source_lang: str
    target_lang: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TranslationHistoryCreate(BaseModel):
    original_text: str
    translated_text: str
    source_lang: str
    target_lang: str

# Routes
@api_router.get("/")
async def root():
    return {
        "message": "Indian Language Translator API",
        "custom_model": "en-hi uses your custom trained MarianMT model (checkpoint-122000)",
        "other_models": "NLLB-200 for hi-en, en-ta, ta-en"
    }

@api_router.post("/translate", response_model=TranslateResponse)
async def translate_text(request: TranslateRequest):
    """Translate text - uses custom MarianMT for en-hi, NLLB for others"""
    try:
        model_key = f"{request.source_lang}-{request.target_lang}"
        if model_key not in MODEL_MAPPINGS:
            raise HTTPException(status_code=400, detail=f"Translation pair {model_key} not supported")
        
        model_type = MODEL_TYPES[model_key]
        model, tokenizer = get_translation_model(model_key)
        
        logger.info(f"Translating with {model_type} model: {request.source_lang} -> {request.target_lang}")
        logger.info(f"Input text: '{request.text[:100]}...'")
        
        if model_type == "marian":
            # Your custom MarianMT model - standard Marian translation
            logger.info(f"Using CUSTOM MarianMT model")
            
            inputs = tokenizer(
                request.text,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=512
            )
            
            translated_tokens = model.generate(
                **inputs,
                max_length=512,
                num_beams=5,
                early_stopping=True
            )
            
            translated_text = tokenizer.decode(translated_tokens[0], skip_special_tokens=True)
            model_used = f"Custom MarianMT (checkpoint-122000)"
            
        elif model_type == "nllb":
            # NLLB model
            src_lang_code = NLLB_LANG_CODES[request.source_lang]
            tgt_lang_code = NLLB_LANG_CODES[request.target_lang]
            
            logger.info(f"Using NLLB model: {src_lang_code} -> {tgt_lang_code}")
            
            tokenizer.src_lang = src_lang_code
            inputs = tokenizer(
                request.text,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=512
            )
            
            target_lang_token_id = tokenizer.convert_tokens_to_ids(tgt_lang_code)
            
            translated_tokens = model.generate(
                **inputs,
                forced_bos_token_id=target_lang_token_id,
                max_length=512,
                num_beams=5,
                early_stopping=True
            )
            
            translated_text = tokenizer.batch_decode(translated_tokens, skip_special_tokens=True)[0]
            model_used = "Meta NLLB-200"
        
        logger.info(f"✅ Translation: '{translated_text[:100]}...'")
        
        return TranslateResponse(
            translated_text=translated_text,
            source_lang=request.source_lang,
            target_lang=request.target_lang,
            original_text=request.text,
            model_used=model_used
        )
        
    except FileNotFoundError as e:
        logger.error(f"Model file not found: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Custom model not found at {CUSTOM_EN_HI_MODEL_PATH}. Please check the path."
        )
    except Exception as e:
        logger.error(f"Translation error: {str(e)}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")

@api_router.post("/speech-to-text", response_model=SpeechToTextResponse)
async def speech_to_text(file: UploadFile = File(...), language: Optional[str] = None):
    """Convert speech to text using FREE Google Speech Recognition"""
    temp_audio_path = None
    wav_path = None
    
    try:
        audio_data = await file.read()
        logger.info(f"Received audio file: {file.filename}, size: {len(audio_data)} bytes")
        
        file_ext = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
        temp_audio_path = tempfile.mktemp(suffix=file_ext)
        
        with open(temp_audio_path, 'wb') as f:
            f.write(audio_data)
        
        try:
            logger.info("Converting audio to WAV...")
            audio = AudioSegment.from_file(temp_audio_path)
            wav_path = temp_audio_path.replace(file_ext, ".wav")
            audio.export(wav_path, format="wav", parameters=["-ar", "16000", "-ac", "1"])
            audio = None
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Audio conversion failed: {str(e)}")
        
        try:
            with sr.AudioFile(wav_path) as source:
                audio_content = recognizer.record(source)
                
            lang_code = {"hi": "hi-IN", "ta": "ta-IN", "en": "en-US"}.get(language, "en-US")
            text = recognizer.recognize_google(audio_content, language=lang_code)
            
            return SpeechToTextResponse(text=text, language=language)
            
        except sr.UnknownValueError:
            raise HTTPException(status_code=400, detail="Could not understand audio")
        except sr.RequestError:
            raise HTTPException(status_code=500, detail="Speech recognition service unavailable")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Speech-to-text failed: {str(e)}")
        
    finally:
        import time
        for path in [temp_audio_path, wav_path]:
            if path and os.path.exists(path):
                try:
                    time.sleep(0.1)
                    os.remove(path)
                except:
                    pass

@api_router.post("/text-to-speech")
async def text_to_speech(request: TextToSpeechRequest):
    try:
        lang_code = GTTS_LANG_MAP.get(request.language, "en")
        tts = gTTS(text=request.text, lang=lang_code, slow=False)
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as temp_audio:
            tts.save(temp_audio.name)
            temp_audio_path = temp_audio.name
        
        with open(temp_audio_path, "rb") as audio_file:
            audio_content = audio_file.read()
        
        os.remove(temp_audio_path)
        return Response(content=audio_content, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Text-to-speech failed: {str(e)}")

@api_router.post("/translation-history", response_model=TranslationHistory)
async def save_translation(input: TranslationHistoryCreate):
    try:
        history_dict = input.model_dump()
        history_obj = TranslationHistory(**history_dict)
        doc = history_obj.model_dump()
        doc['timestamp'] = doc['timestamp'].isoformat()
        await db.translation_history.insert_one(doc)
        return history_obj
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save translation: {str(e)}")

@api_router.get("/translation-history", response_model=List[TranslationHistory])
async def get_translation_history():
    try:
        history = await db.translation_history.find({}, {"_id": 0}).sort("timestamp", -1).limit(50).to_list(50)
        for item in history:
            if isinstance(item['timestamp'], str):
                item['timestamp'] = datetime.fromisoformat(item['timestamp'])
        return history
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get history: {str(e)}")

@api_router.get("/supported-languages")
async def get_supported_languages():
    return {
        "languages": [
            {"code": "en", "name": "English"},
            {"code": "hi", "name": "हिन्दी (Hindi)"},
            {"code": "ta", "name": "தமிழ் (Tamil)"}
        ],
        "translation_pairs": list(MODEL_MAPPINGS.keys()),
        "model_info": {
            "en-hi": "Custom Fine-tuned MarianMT (checkpoint-122000, Samanantar dataset)",
            "hi-en": "Meta NLLB-200",
            "en-ta": "Meta NLLB-200",
            "ta-en": "Meta NLLB-200"
        }
    }

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()