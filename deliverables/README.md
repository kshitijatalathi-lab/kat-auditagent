# SmartAudit – User Guide

SmartAudit helps you ask compliance questions, use your own policies, and export quick reports — in plain language.
 
## Demo Video

[Watch a short demo](https://www.loom.com/share/f174ad6dc2fe4b1392bfa3578f44e993?sid=838c1b0f-913b-4468-bfce-77e701888426)


## ✨ Highlights
- __Chat with citations__: clear answers with short refs like [#1]
- __Your sources__: upload your policies (PDF/TXT/DOCX) and search them
- __Audit checklist__: guided Q&A with AI feedback; export to PDF/TXT
- __Flexible providers__: OpenAI, Gemini, or local via Ollama
- __Graceful fallbacks__: auto-switch when a provider is rate‑limited

## 🧩 What you can do at a glance
- __Ask questions__: get clear answers with short source references
- __Use your own documents__: upload your policies or guidelines
- __See the context__: view the key passages used to answer
- __Give feedback__: quickly tell us if an answer helped
- __Create reports__: step through a checklist and export a summary

## 🧭 What you can do
- __Ask and understand__: type a question in the Chat tab (e.g., "What are GDPR data subject rights?") and see which sources support the answer
- __Bring your own policies__: upload files in the UI or drop them into `data/company_policies/`
- __Create a quick report__: complete the Audit Checklist and export

## 🚀 Getting started (simple)
1) Open the SmartAudit app on your computer
2) Go to the Chat tab
3) Upload any company policies you want the AI to use (PDF/Word/Text)
4) Ask your question and review the answer with sources
5) Optional: use the Audit Checklist to create a shareable report
## 🖥️ Using the app
- Open the app and you’ll see two tabs: Chat and Audit Checklist
- In Chat, type your question and press Enter
- To include your own documents, click "Document Upload" and add files

## 💬 Tips for better answers
- Be specific (e.g., “What do we need to include in a DPIA?”)
- Add your internal policies for more tailored answers
- Skim the “Retrieved Context” box to see why the answer was given

## ✅ Audit Checklist & Reports
- Walk through simple questions, one by one
- Click “Generate AI Feedback” to get suggestions
- Export a clean report to share with your team (PDF or Text)

## 🔧 Troubleshooting
- If the answer looks off, try rephrasing the question
- If nothing shows up, add or upload relevant documents
- If it seems slow, wait a moment and try again

## 🔒 Privacy & offline
- Use `ollama` to keep inference local
- Your uploaded files are processed locally; reports are written to `reports/`

## 📁 Where things go
- Your uploaded documents: safely stored on your machine
- Processed data: used by the app to find answers quickly
- Reports: saved to a "reports" folder for easy sharing

> Tip: You can set `GRADIO_SHARE=true` before launching to get a public link.

## ❓ Need help?
- Tell us what you were trying to do and what you saw on screen
- We’ll guide you step by step
