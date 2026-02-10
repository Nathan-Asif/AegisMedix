# AegisMedix: The AI Medical Sentinel 🩺🛡️

![AegisMedix Badge](assets/imgs/main_logo.png)

AegisMedix is a state-of-the-art, autonomous medical companion designed to bridge the gap between passive health tracking and proactive healthcare intervention. Powered by the native multimodality of **Gemini 3**, AegisMedix acts as a 24/7 sentinel, monitoring recovery, managing complex medication schedules, and providing real-time visual and audio health consultations.

### 🚀 Key Features

*   **Live Health Bench (Gemini 3 Multimodal Bidi)**: Conduct high-fidelity, real-time voice and video consultations. Dr. Aegis identifies medications, observes physical symptoms, and reasons about your health natively through live streams.
*   **Proactive Recovery Engine**: An intelligent progress tracker that correlates temporal healing with real-world medication adherence.
*   **Agentic Medication Management**: Dr. Aegis automatically schedules new medications mentioned during sessions and tracks adherence in real-time.
*   **24/7 Sentinel Engine**: A background process that monitors missed doses and triggers immediate notifications or SOS alerts.
*   **Deep Vitals Integration**: Continuous tracking and analysis of heart rate, SpO2, and sleep patterns, with high-speed correlation directly within the AI dialogue.

---

### 🛠️ Architecture

AegisMedix is built as a robust monorepo:

*   **Cortex (Backend)**: FastAPI server handling the Gemini 3 Live API proxy, background task engine, and secure data processing.
*   **Desktop (Frontend)**: A premium Next.js interface with dark-mode aesthetics, real-time WebSocket streaming, and a high-performance health dashboard.
*   **Database**: Supabase (PostgreSQL) for secure patient history, encrypted session logs, and real-time state persistence.

---

### 🔮 Powered by Gemini 3

AegisMedix isn't just integrated with AI—it's built around it. We leverage:
- **Native Multimodality**: Correlating live video frames (medicine recognition) with high-frequency audio (symptom reporting) in a single inference session.
- **Low-Latency Live API**: Enabling natural, human-like medical conversations with zero perceived lag.
- **Advanced Reasoning**: Analyzing months of patient vitals and logs in milliseconds to provide deeply personalized recovery guidance.

---

### 📦 Quick Start

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/Nathan-Asif/AegisMedix.git
    ```

2.  **Environment Setup**
    Create a `.env` in the `cortex` directory:
    ```env
    GEMINI_API_KEY=your_key_here
    SUPABASE_URL=your_supabase_url
    SUPABASE_SERVICE_KEY=your_key_here
    ```

3.  **Run with Docker Compose**
    ```bash
    docker-compose up --build
    ```

---

### 👤 Developed By
**Nathan Asif** - Independent Developer & AI Sentinel Architect.
Built for the **Google Gemini API Developer Competition**.
