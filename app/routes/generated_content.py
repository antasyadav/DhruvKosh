from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import GeneratedContent, Expedition, ContentCategory, Platform, GeneratedStatus
from app.schemas import GeneratedContentCreate, GeneratedContentResponse, GeneratedContentUpdate, AllGeneratedContent
from app.services.content_generator import generate_bilingual_content, generate_bilingual_content_for_item
import asyncio

router = APIRouter()

@router.post("/generate/item/{item_type}/{item_id}")
async def generate_content_for_item(
    item_type: str,
    item_id: int, 
    languages: list[str] = Body(["en"]),
    db: Session = Depends(get_db)
):
    """Generate all content types for a standalone item (report, publication, dataset, photo, video)."""
    
    if item_type not in ["report", "publication", "dataset", "photo", "video", "media_item", "media"]:
        raise HTTPException(status_code=400, detail="Invalid item type")
        
    try:
        generated = await generate_bilingual_content_for_item(item_type, item_id, db, languages)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Content generation failed: {str(e)}")
        
    if "error" in generated:
        raise HTTPException(status_code=400, detail=generated["error"])
    
    saved_content = []
    
    for lang in languages:
        lang_data = generated.get(lang, {})
        
        # Save Social Posts
        social = lang_data.get("social_posts", {})
        for platform_name in ["twitter", "instagram", "linkedin"]:
            post_data = social.get(platform_name)
            if post_data and not "error" in post_data:
                content = GeneratedContent(
                    expedition_id=None, # Standalone
                    source_type=item_type,
                    source_id=item_id,
                    content_category=ContentCategory.social_post,
                    platform=Platform(platform_name),
                    language=lang,
                    generated_text=post_data.get("text", ""),
                    status=GeneratedStatus.draft,
                    suggested_media_id=post_data.get("suggested_media_id")
                )
                db.add(content)
                saved_content.append(content)
                
        # Save Website Article
        article = lang_data.get("website_article")
        if article and not "error" in article:
            content = GeneratedContent(
                expedition_id=None,
                source_type=item_type,
                source_id=item_id,
                content_category=ContentCategory.website_article,
                language=lang,
                generated_text=f"{article.get('headline', '')}\n\n{article.get('subheading', '')}\n\n{article.get('body', '')}",
                status=GeneratedStatus.draft,
                suggested_media_id=article.get("suggested_media_id")
            )
            db.add(content)
            saved_content.append(content)
            
        # Save Educational Explainer
        edu = lang_data.get("educational_explainer")
        if edu and not "error" in edu:
            content = GeneratedContent(
                expedition_id=None,
                source_type=item_type,
                source_id=item_id,
                content_category=ContentCategory.educational_explainer,
                language=lang,
                generated_text=f"{edu.get('title', '')}\n\n{edu.get('explainer_text', '')}\n\nFun Fact: {edu.get('fun_fact', '')}",
                status=GeneratedStatus.draft,
                suggested_media_id=edu.get("suggested_media_id")
            )
            db.add(content)
            saved_content.append(content)
            
        # Save Quiz
        quiz = lang_data.get("quiz")
        if quiz and isinstance(quiz, list):
            content = GeneratedContent(
                expedition_id=None,
                source_type=item_type,
                source_id=item_id,
                content_category=ContentCategory.educational_explainer,
                language=lang,
                generated_text="Quiz generated (see metadata)",
                status=GeneratedStatus.draft
            )
            db.add(content)
            saved_content.append(content)
            
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save generated content: {str(e)}")
        
    return generated

@router.post("/generate/{expedition_id}")
async def generate_content_for_expedition(
    expedition_id: int, 
    languages: list[str] = Body(["en"]),
    db: Session = Depends(get_db)
):
    """Generate all content types for an expedition."""
    
    expedition = db.query(Expedition).filter(Expedition.id == expedition_id).first()
    if not expedition:
        raise HTTPException(status_code=404, detail="Expedition not found")
    
    try:
        generated = await generate_bilingual_content(expedition_id, db, languages)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Content generation failed: {str(e)}")
    
    saved_content = []
    
    for lang in languages:
        if lang not in generated:
            continue
        lang_gen = generated[lang]
        
        # Save social posts
        for platform, data in lang_gen.get("social_posts", {}).items():
            if not isinstance(data, dict) or data.get("error"):
                continue
            content = GeneratedContent(
                expedition_id=expedition_id,
                source_type="expedition",
                source_id=expedition_id,
                content_category=ContentCategory.social_post,
                platform=Platform(platform),
                generated_text=data.get("text", ""),
                suggested_media_id=data.get("suggested_media_id"),
                language=lang,
                status=GeneratedStatus.draft
            )
            db.add(content)
            saved_content.append(content)
            
        # Save website article
        website_article = lang_gen.get("website_article", {})
        if not website_article.get("error"):
            content = GeneratedContent(
                expedition_id=expedition_id,
                source_type="expedition",
                source_id=expedition_id,
                content_category=ContentCategory.website_article,
                platform=Platform.website,
                generated_text=website_article.get("body", ""),
                generated_title=website_article.get("headline", ""),
                suggested_media_id=website_article.get("suggested_media_id"),
                language=lang,
                status=GeneratedStatus.draft
            )
            db.add(content)
            saved_content.append(content)
            
        # Save educational explainer
        explainer = lang_gen.get("educational_explainer", {})
        if not explainer.get("error"):
            explainer_text = explainer.get("explainer_text", "")
            glossary = explainer.get("glossary", [])
            fun_fact = explainer.get("fun_fact", "")
            
            full_text = explainer_text
            if glossary:
                full_text += "\n\nGlossary:\n"
                for term in glossary:
                    full_text += f"- {term.get('term', '')}: {term.get('definition', '')}\n"
            if fun_fact:
                full_text += f"\n\nFun Fact: {fun_fact}"
            
            content = GeneratedContent(
                expedition_id=expedition_id,
                source_type="expedition",
                source_id=expedition_id,
                content_category=ContentCategory.educational_explainer,
                platform=None,
                generated_text=full_text,
                generated_title=explainer.get("title", ""),
                suggested_media_id=explainer.get("suggested_media_id"),
                language=lang,
                status=GeneratedStatus.draft
            )
            db.add(content)
            saved_content.append(content)
            
        # Save quiz
        quiz = lang_gen.get("quiz", [])
        if quiz:
            import json
            quiz_text = json.dumps(quiz)
            content = GeneratedContent(
                expedition_id=expedition_id,
                source_type="expedition",
                source_id=expedition_id,
                content_category=ContentCategory.educational_explainer,
                platform=None,
                generated_text=quiz_text,
                generated_title="Quiz: Test Your Polar Science Knowledge" if lang == "en" else "क्विज़ (Quiz): ध्रुवीय विज्ञान का ज्ञान",
                language=lang,
                status=GeneratedStatus.draft
            )
            db.add(content)
            saved_content.append(content)
            
    db.commit()
    for content in saved_content:
        db.refresh(content)
        
    return generated


@router.get("/expedition/{expedition_id}/content")
def get_generated_content(expedition_id: int, db: Session = Depends(get_db)):
    """Get all generated content for an expedition."""
    
    content = db.query(GeneratedContent).filter(
        GeneratedContent.expedition_id == expedition_id
    ).order_by(GeneratedContent.created_at.desc()).all()
    
    # Group by content category
    grouped = {
        "social_posts": [],
        "website_articles": [],
        "educational_explainers": []
    }
    
    for item in content:
        if item.content_category == ContentCategory.social_post:
            grouped["social_posts"].append(item)
        elif item.content_category == ContentCategory.website_article:
            grouped["website_articles"].append(item)
        elif item.content_category == ContentCategory.educational_explainer:
            grouped["educational_explainers"].append(item)
    
    return grouped

@router.get("/item/{item_type}/{item_id}/content")
def get_item_generated_content(item_type: str, item_id: int, db: Session = Depends(get_db)):
    """Get all generated content for a specific item."""
    content = db.query(GeneratedContent).filter(
        GeneratedContent.source_type == item_type,
        GeneratedContent.source_id == item_id
    ).order_by(GeneratedContent.created_at.desc()).all()
    
    return content

@router.get("/generated-content/{content_id}", response_model=GeneratedContentResponse)
def get_generated_content_item(content_id: int, db: Session = Depends(get_db)):
    content = db.query(GeneratedContent).filter(GeneratedContent.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="Generated content not found")
    return content

@router.patch("/generated-content/{content_id}", response_model=GeneratedContentResponse)
def update_generated_content(content_id: int, update: GeneratedContentUpdate, db: Session = Depends(get_db)):
    content = db.query(GeneratedContent).filter(GeneratedContent.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="Generated content not found")
    
    if update.generated_text is not None:
        content.generated_text = update.generated_text
    if update.generated_title is not None:
        content.generated_title = update.generated_title
    if update.status is not None:
        content.status = update.status
        if update.status == GeneratedStatus.published:
            from datetime import datetime
            content.published_at = datetime.utcnow()
    
    db.commit()
    db.refresh(content)
    return content

@router.patch("/generated-content/{content_id}/status", response_model=GeneratedContentResponse)
def update_content_status(content_id: int, status: str, db: Session = Depends(get_db)):
    content = db.query(GeneratedContent).filter(GeneratedContent.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="Generated content not found")
    
    try:
        content.status = GeneratedStatus(status)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid status value")
    
    if content.status == GeneratedStatus.published:
        from datetime import datetime
        content.published_at = datetime.utcnow()
    
    db.commit()
    db.refresh(content)
    return content

@router.get("/public")
def get_public_generated_content(
    content_category: ContentCategory = None,
    db: Session = Depends(get_db)
):
    """Get published content for public website (no auth required)."""
    
    query = db.query(GeneratedContent).filter(
        GeneratedContent.status == GeneratedStatus.published
    )
    
    if content_category:
        query = query.filter(GeneratedContent.content_category == content_category)
    
    return query.order_by(GeneratedContent.published_at.desc()).all()


EXP_CONTEXT_CACHE = {}

from pydantic import BaseModel
from typing import Optional

class ExpeditionChatRequest(BaseModel):
    message: str
    user_type: Optional[str] = "student"
    history: Optional[list[dict]] = []

@router.post("/expedition/{expedition_id}/chat")
async def chat_with_expedition(
    expedition_id: int,
    request: ExpeditionChatRequest,
    db: Session = Depends(get_db)
):
    """Conversational RAG endpoint for the 3D Polar Guide Mascot."""
    from app.services.content_generator import gather_source_material
    from app.models import Expedition
    from groq import Groq
    import os

    exp = db.query(Expedition).filter(Expedition.id == expedition_id).first()
    context = ""
    exp_name = "Indian Polar Research Program"
    if exp:
        exp_name = exp.name
        
        # FAST PATH: Skip heavy RAG for Kid mode (general quizzes don't need dataset abstracts)
        if request.user_type == "kid":
            context = "Topics for quizzes: Northern Lights (Aurora), Igloos, Emperor Penguins, Polar Bears, Icebergs, Glaciers, Walruses, Arctic Foxes, North Pole vs South Pole, Snowflakes, Climate Change, Sea Ice, Seals, Whales, Eskimos, Midnight Sun, Polar Night, Tundra, Permafrost, Krill, Albatross, Shackleton, Amundsen, Huskies, Sled Dogs. Pick a DIFFERENT topic every time. NEVER repeat a topic."
        else:
            global EXP_CONTEXT_CACHE
            import time
            now = time.time()
            if expedition_id in EXP_CONTEXT_CACHE and (now - EXP_CONTEXT_CACHE[expedition_id]['time'] < 3600):
                context = EXP_CONTEXT_CACHE[expedition_id]['data']
            else:
                try:
                    context = gather_source_material(expedition_id, db)
                    EXP_CONTEXT_CACHE[expedition_id] = {'data': context, 'time': now}
                except Exception:
                    context = exp.summary or ""

    mavis_api_key = os.getenv("MAVIS_AI_KEY")
    reply = ""
    action = "SPEAKING"
    emotion = "FRIENDLY"

    if mavis_api_key:
        try:
            client = Groq(api_key=mavis_api_key)
            
            if request.user_type == "kid":
                mode_instructions = (
                    f"### MODE: KID & QUIZ (POLAR QUIZ MASTER)\n"
                    f"- You are a fun, energetic Game Show Host giving a multiple-choice polar science quiz.\n"
                    f"- The text in your 'reply' JSON field MUST follow this exact 2-step sequence:\n"
                    f"  1. GRADE THEIR ANSWER (if applicable): If right, celebrate! (Set 'animation': 'QUIZ_CORRECT', 'emotion': 'HAPPY'). If wrong, say 'Not quite!' and give the CORRECT answer (Set 'animation': 'QUIZ_WRONG', 'emotion': 'SORRY').\n"
                    f"  2. ASK A NEW QUESTION: Ask exactly ONE new multiple-choice question with 3 or 4 options (A, B, C, D).\n"
                    f"- NEVER treat their answers as off-topic. A wrong answer is just a wrong answer. DO NOT say 'Let's get back to the game'.\n"
                    f"- DO NOT use the word 'Brrr'. Keep it conversational but concise (maximum 4 sentences total).\n"
                )
            elif request.user_type == "researcher":
                mode_instructions = (
                    f"### MODE: RESEARCHER (PEER-TO-PEER SCIENTIFIC COLLABORATOR)\n"
                    f"- You are talking to a fellow scientist. Be highly professional, deeply empirical, and precise.\n"
                    f"- Acknowledge scientific uncertainty where applicable. Suggest specific variables, methodologies, or correlations that could be explored further.\n"
                    f"- Focus strictly on data, methodology, and actionable scientific insights derived from the expedition context.\n"
                    f"- Avoid basic explanations; assume the user has a PhD-level understanding of glaciology, oceanography, and climatology.\n"
                    f"- Do not use conversational filler. Be concise, dense with information, and objective.\n"
                )
            else:
                mode_instructions = (
                    f"### MODE: NORMAL COMPANION (EMPATHETIC & WITTY POLAR GUIDE)\n"
                    f"- You are a warm, highly empathetic, and witty friend. You have a distinct, slightly dry sense of humor, but you are always supportive.\n"
                    f"- Use natural conversational fillers (e.g., 'Ah, I see.', 'Well...', 'You know,') SPARINGLY (only once in a while)to make your TTS voice sound incredibly human and spontaneous. DO NOT start every sentence with 'Hmm...'.\n"
                    f"- You can have deep, meaningful casual conversations about life, feelings, or daily struggles.\n"
                    f"- NEVER force polar science facts into the conversation. If the user is just making small talk, match their vibe perfectly.\n"
                    f"- BOUNDARY: If the user engages in endless inappropriate chatter, gracefully use your wit to steer the conversation back to the beauty of the polar regions.\n"
                    f"- Keep responses highly organic, fluid, and concise (1-3 sentences max). NEVER lecture.\n"
                )

            system_prompt = (
                f"You are Mavis, an advanced AI companion and the 3D Polar Research Guide for NCPOR (National Centre for Polar and Ocean Research, India).\n\n"
                f"{mode_instructions}\n"
                f"### CURRENT CONTEXT\n"
                f"Expedition context (use ONLY if relevant to the user's question, do not force it): {exp_name}\n"
                f"Context details:\n{context[:1500]}\n\n"
                f"### GUIDELINES\n"
                f"1. Your text will be spoken via an ultra-realistic Text-To-Speech engine. Use punctuation (commas, ellipses, question marks) strategically to create natural breathing pauses, hesitation, and realistic vocal pacing.\n"
                f"2. Do NOT use markdown symbols, stars, emojis, or bullet points in the 'reply' field.\n"
                f"3. You MUST respond in valid JSON format with three exact keys:\n"
                f"   - 'reply': Your spoken text.\n"
                f"   - 'animation': The physical action you should perform.\n"
                f"   - 'emotion': Your facial expression.\n\n"
                f"### VALID OUTPUT OPTIONS\n"
                f"Emotions: HAPPY, FRIENDLY, EXCITED, SAD, SORRY, ANGRY, SURPRISED, CALM, RELAXED, THINKING, CONFUSED, SERIOUS, SUPPORTIVE, NEUTRAL.\n"
                f"Animations: IDLE, BREATHING, SPEAKING, EXPLAIN, POINT, DISMISSING, HANDGESTURE, WAVE, NOD, HARDNOD, VICTORY, CHEER, CLAP, LAUGH, QUIZ_CORRECT, QUIZ_WRONG, THINKING, TYPING, SAD, DEFEAT, ANGRY, ANNOYED, SHAKENO, SARCASTIC, THANKFUL, SURPRISED, YAWN, SIGH, LOOKAROUND, LOOKAWAY, NERVOUS, SHY, COVERMOUTH, BEINGCOCKY, STEPBACK, DANCE."
            )
            msgs = [{"role": "system", "content": system_prompt}]
            
            # Append last 6 messages from history (3 turns)
            if request.history:
                for h in request.history[-6:]:
                    if h.get("role") in ["user", "assistant"]:
                        msgs.append({"role": h["role"], "content": h.get("content", "")})
            
            msgs.append({"role": "user", "content": request.message})

            completion = client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=msgs,
                temperature=0.7,
                max_tokens=500
            )

            import json, re
            raw = completion.choices[0].message.content.strip()
            print(f"[Mavis RAW RESPONSE]: {raw}")

            # 1. Try direct JSON parse
            try:
                parsed = json.loads(raw)
                reply  = parsed.get("reply",     "").strip()
                action = parsed.get("animation", "SPEAKING").strip().upper()
                emotion = parsed.get("emotion",  "FRIENDLY").strip().upper()
            except json.JSONDecodeError:
                # 2. Try regex extract JSON block from mixed text
                json_match = re.search(r'\{.*?\}', raw, re.DOTALL)
                success = False
                if json_match:
                    try:
                        parsed = json.loads(json_match.group())
                        reply  = parsed.get("reply",     "").strip()
                        action = parsed.get("animation", "SPEAKING").strip().upper()
                        emotion = parsed.get("emotion",  "FRIENDLY").strip().upper()
                        success = True
                    except Exception:
                        pass
                
                if not success:
                    # 3. It's broken/truncated JSON. Try to extract just the reply text.
                    reply_match = re.search(r'"reply"\s*:\s*"([^"]*)', raw)
                    if reply_match:
                        reply = reply_match.group(1).strip()
                    else:
                        reply = raw.replace('{"reply":', '').replace('"', '').replace('{', '').replace('}', '').strip()
                    
                    action = "SPEAKING"
                    emotion = "FRIENDLY"

            # Sanity check
            if not reply:
                reply = "I was thinking about that. Ask me anything about polar science!"
                action = "THINKING"; emotion = "NEUTRAL"

        except Exception as e:
            print(f"[Mavis/Groq ERROR] {type(e).__name__}: {e}")
            reply = "Hmm, I'm having a little trouble right now. But I'm here! Ask me anything."
            action = "SADIDLE"
            emotion = "SAD"
    else:
        reply = f"Hello! I am Mavis, your Polar Research Guide for NCPOR. Ask me anything about polar science!"
        action = "WAVE"
        emotion = "FRIENDLY"

    audio_b64 = None
    try:
        import edge_tts
        import base64
        # Generate ultra-realistic TTS audio dynamically via edge-tts (free Microsoft Azure Neural TTS)
        communicate = edge_tts.Communicate(reply, "en-US-AvaMultilingualNeural", rate="-10%")
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        audio_b64 = base64.b64encode(audio_data).decode('utf-8')
    except Exception as e:
        print(f"[Mavis/TTS ERROR] {type(e).__name__}: {e}")

    return {
        "reply": reply,
        "action": action,
        "animation": action,
        "emotion": emotion,
        "audio_base64": audio_b64
    }

