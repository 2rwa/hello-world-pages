# 母音リスナー / Vowel Listener

ブラウザのマイク入力から日本語5母音 /a i ɯ e o/ をリアルタイム推定するWebアプリ。

## 処理

1. getUserMedia() でモノラル音声を取得
2. 約70 msのフレームを12 kHz相当に再標本化
3. DC除去 + pre-emphasis + Hann窓
4. 16次LPC (Levinson–Durbin)
5. LPCスペクトル包絡の局所ピークからF1/F2推定
6. Bark尺度上で日本語5母音の基準点へ最近傍分類
7. 直近7フレームの多数決で表示を安定化

話者差・マイク差を減らすため、5母音それぞれを約1.4秒発音して基準F1/F2を再登録できる。登録値は同一ブラウザのlocalStorageへ保存する。

## テスト

node test-dsp.mjs
node --check app.mjs
node --check dsp.mjs
node --check plot.mjs

test-dsp.mjs はF1/F2を指定した合成all-pole母音を生成し、5母音すべてについて estimateFormants() → classifyVowel() の分類一致を検証する。

## 注意

- マイクはHTTPSまたはlocalhostが必要。
- iOS Safariでは必ずユーザー操作からマイク開始する。
- ブラウザ/OSが echoCancellation, noiseSuppression, autoGainControl の無効化要求を無視する場合がある。
- フォルマントベースの近似判定であり、子音、鼻音、ささやき声、強い環境雑音は対象外。
