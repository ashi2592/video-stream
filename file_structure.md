livestream-platform/
├── backend/                  # FastAPI
│   ├── app/
│   │   ├── api/              # Route handlers
│   │   ├── auth/             # JWT + OAuth logic
│   │   ├── services/         # FFmpeg, streaming, storage
│   │   ├── models/           # DB models
│   │   └── websocket/        # WS connection manager
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/                 # React dashboard
│   ├── src/
│   │   ├── pages/            # Dashboard, Login
│   │   ├── components/       # StreamControl, PlatformSwitcher
│   │   ├── hooks/            # useWebSocket, useAuth
│   │   └── api/              # Axios API client
│   └── package.json
│
├── mobile/                   # React Native
│   ├── src/
│   │   ├── screens/
│   │   ├── components/
│   │   └── services/         # RTMP client
│   └── package.json
│
├── nginx/                    # RTMP server config
│   └── nginx.conf
│
├── docker-compose.yml        # Spins up everything
└── .env.example
