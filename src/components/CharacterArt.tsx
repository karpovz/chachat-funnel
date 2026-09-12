import { copy } from "@/content/funnel";

export function CharacterArt() {
  return (
    <div className="character-scene" aria-label={copy.art.sceneLabel}>
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <span className="scene-star star-one">✦</span>
      <span className="scene-star star-two">✧</span>
      <div className="character-card back-card">
        <div className="mini-landscape">
          <span>☾</span>
        </div>
        <span>{copy.art.world}</span>
      </div>
      <div className="character-card front-card">
        <div className="portrait">
          <svg
            viewBox="0 0 320 340"
            role="img"
            aria-label={copy.art.portraitLabel}
          >
            <defs>
              <linearGradient id="portrait-bg" x2="1" y2="1">
                <stop stopColor="#d6ccff" />
                <stop offset="1" stopColor="#8a65ca" />
              </linearGradient>
              <linearGradient id="hair" x2="1" y2="1">
                <stop stopColor="#45316d" />
                <stop offset="1" stopColor="#251735" />
              </linearGradient>
            </defs>
            <rect width="320" height="340" fill="url(#portrait-bg)" />
            <circle cx="243" cy="80" r="75" fill="#f1dbed" opacity=".35" />
            <path
              d="M40 340Q44 234 104 227L212 227Q282 243 287 340"
              fill="#4d405f"
            />
            <path
              d="M72 261Q34 131 81 61Q113 17 183 36Q268 32 259 154L241 275L182 251L109 270"
              fill="url(#hair)"
            />
            <path d="M133 208L130 250Q164 275 193 247L185 201" fill="#d79991" />
            <ellipse cx="163" cy="142" rx="66" ry="86" fill="#eeb9aa" />
            <path
              d="M94 143Q68 57 130 47Q200 21 235 85L239 159Q202 140 183 82Q146 129 94 143"
              fill="url(#hair)"
            />
            <path
              d="M114 146Q126 136 141 146M182 145Q197 134 211 143"
              fill="none"
              stroke="#513949"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <ellipse cx="130" cy="153" rx="5" ry="7" fill="#4c394a" />
            <ellipse cx="196" cy="151" rx="5" ry="7" fill="#4c394a" />
            <path
              d="M165 152L158 176L166 179M145 193Q164 205 181 190"
              fill="none"
              stroke="#b16e70"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="117" cy="177" r="11" fill="#e89c9a" opacity=".5" />
            <circle cx="203" cy="175" r="11" fill="#e89c9a" opacity=".5" />
            <path
              d="M112 250L154 292L193 247L228 273L211 340L99 340L89 274"
              fill="#b5a3d0"
            />
            <path
              d="M152 292L169 307L186 286"
              fill="none"
              stroke="#807096"
              strokeWidth="3"
            />
            <circle cx="167" cy="316" r="4" fill="#e7d9f6" />
          </svg>
          <span className="character-label">
            <span className="live-dot" /> {copy.art.connection}
          </span>
        </div>
        <div className="card-caption">
          <strong>{copy.art.caption}</strong>
          <span>{copy.art.description}</span>
        </div>
      </div>
      <div className="chat-bubble">
        <span className="bubble-spark">✦</span>
        <p>{copy.art.greeting}</p>
      </div>
      <div className="floating-tag">{copy.art.tag}</div>
    </div>
  );
}
