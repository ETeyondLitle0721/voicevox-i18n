# VOICEVOX Editor (i18n Fork)

本リポジトリは、[VOICEVOX エディター（公式リポジトリ）](https://github.com/VOICEVOX/voicevox) の多言語対応（i18n）を試みるフォーク版です。

Vite の仮想モジュール（Virtual Module）プラグインを活用したビルド時インジェクション方式を採用することで、**Vue および TypeScript のソースコードへ一切変更を加えない（完全非侵入）** 形で国際化を実現しています。

> **Note**  
> 本変更は本家リポジトリへのプルリクエスト（PR）を提出済みであり、マージを待っている段階です。

---

## 🌐 対応言語 / Supported Languages

現在、以下の言語に対応しています。

- ja-JP **日本語** (Default Fallback)
- en-US **英語** (English)
- zh-CN **簡体字中国語** (Simplified Chinese / 大陆简体)
- zh-TW **繁体字中国語** (Traditional Chinese / 台灣正體)

※ 設定（OPTIONS）画面からいつでも言語を切り替えることができます。

---

## 📸 スクリーンショット / Screenshots

### 1. 設定画面（OPTIONS）での言語切り替え
> OPTIONS 画面に言語を選択する項目を追加しました。

<img width="2060" height="1320" alt="image" src="https://github.com/user-attachments/assets/350f0671-4ce5-424b-9d3d-b30b839b9b02" />



---

### 2. テキスト編集・会話画面（Talk Editor）
> 各メニューやボタンテキストが選択した言語に即座に反映されます。

<img width="2060" height="1320" alt="image" src="https://github.com/user-attachments/assets/c0fbcfc2-c9e7-49ea-91a0-f79a5364a50c" />


---

### 3. ソング編集画面（Song Editor）
> ソング機能のUI要素も完全にローカライズされています。

<img width="2060" height="1320" alt="image" src="https://github.com/user-attachments/assets/9c8fc1d8-4c3a-4405-8622-dcf70f0c0326" />


---

## 🛠 実装の仕組み（非侵入型 i18n）

従来の Vue/TS プロジェクトで多言語化を行う場合、テンプレート内の文字列を `$t('key')` に書き換えるなど、大量のコード変更が発生します。

本フォークでは、Vite の仮想モジュール機能を使い、ビルド時にテキストノードやASTを解析して動的に翻訳データを注入・置換しています。これにより以下のようなメリットがあります：

- **ソースコードの汚染ゼロ**：既存のコンポーネントコードに差分が生じないため、本家（Upstream）の更新追従（`git merge` / `rebase`）が極めて容易です。
- **最小限の差分**：リポジトリ内での変更は OPTIONS 画面の言語選択 UI 追加と、Vite プラグインの設定追加のみにとどまっています。

---

## 🚀 ビルド＆実行方法

開発環境の構築およびビルド手順については、[本家 README](https://github.com/VOICEVOX/voicevox#readme) をご参照ください。

```bash
# パッケージのインストール
pnpm install

# 開発用起動 (Electron)
pnpm run electron:serve

```

---

## 📄 ライセンス / License

本プロジェクトは本家 VOICEVOX と同等に [LGPL v3](https://www.google.com/search?q=./LICENSE) ライセンスのもとで公開されています。
