# VOICEVOX ずんだもん Actions test

GitHub Actions の Ubuntu CPU runner で公式 `voicevox/voicevox_engine:cpu-latest` を起動し、
`/speakers` から「ずんだもん / ノーマル」の style ID を検出して WAV を生成する実験です。

生成物:
- `zundamon.wav`
- `query.json` — モーラ・アクセント等を次の実験で編集するために保存
- `metadata.json` — WAV の実測情報

クレジット: VOICEVOX:ずんだもん
