# VOICEVOX Editor (i18n Fork)

本リポジトリは、[VOICEVOX エディター（公式リポジトリ）](https://github.com/VOICEVOX/voicevox) に多言語対応（i18n）を追加したフォーク版です。

本フォークでは、**既存の Vue コンポーネントや TypeScript のアプリケーションコードを翻訳用のキーへ書き換えることなく**、Vite の Virtual Module とブラウザ実行時の DOM 翻訳を組み合わせてローカライズを実現しています。

> **Note**  
> 本変更は本家リポジトリへのプルリクエスト（PR）を提出済みであり、マージを待っている段階です。

---

## 🌐 対応言語 / Supported Languages

現在、翻訳データが登録されている言語は以下のとおりです。

- ja-JP **日本語** (Source / Default Fallback)
- en-US **英語** (English)
- zh-CN **簡体字中国語** (Simplified Chinese / 简体中文)
- zh-TW **繁体字中国語** (Traditional Chinese / 台灣正體)
- ko-KR **韓国語** (Korean / 한국어)

翻訳元となるソース言語は `ja-JP` です。

対応言語の定義・バージョン情報は `tools/i18n/locales/languages.xml` で管理されています。

> `zh-HK`、`vi-VN`、`th-TH` はランタイムの locale 型および翻訳ルール構造として予約・対応可能な状態ですが、現時点の `languages.xml` には正式な翻訳言語として登録されていません。

---

## 📸 スクリーンショット / Screenshots

### 1. 設定画面（OPTIONS）での言語切り替え

> OPTIONS 画面に言語を選択する項目を追加しています。

<img width="2056" height="1267" alt="image" src="https://github.com/user-attachments/assets/39cb5274-a497-44cb-a434-a72af8b96683" />

---

### 2. テキスト編集・会話画面（Talk Editor）

> メニュー、ボタン、ラベルなどの UI テキストが選択した言語へローカライズされます。

<img width="2056" height="1267" alt="image" src="https://github.com/user-attachments/assets/424d18ec-d0fe-4104-887e-5617100cf231" />

---

### 3. ソング編集画面（Song Editor）

> ソング機能の UI 要素も同じランタイム翻訳機構によってローカライズされます。

<img width="2056" height="1267" alt="image" src="https://github.com/user-attachments/assets/abfc50b3-439a-431e-8ae4-a0b182cb6a3b" />

---

## 🛠 実装の仕組み / Implementation

本フォークの i18n は、一般的な `vue-i18n` のようにテンプレート内の文字列を `$t("key")` に置き換える方式ではありません。

大きく分けて、

1. **XML による翻訳ルールの管理**
2. **Vite による翻訳ルールのビルド時パッケージング**
3. **Virtual Module によるランタイムの注入**
4. **ブラウザ上でレンダリング済み DOM を翻訳**
5. **MutationObserver による動的コンテンツへの追従**

という構成になっています。

### 1. 翻訳ルールは XML で管理

翻訳データは以下に配置されています。

```text
tools/i18n/locales/translates/
├── group_001.xml
├── group_002.xml
├── ...
└── group_012.xml
```

各 XML は、`ja-JP` の原文と各言語の翻訳を対応付けます。

例えば概念的には次のような構造です。

```xml
<item>
    <match type="equals">
        <text content="設定"/>
    </match>

    <translate>
        <en-US content="Settings"/>
        <zh-CN content="设置"/>
        <zh-TW content="設定"/>
        <ko-KR content="설정"/>
    </translate>
</item>
```

翻訳キーとして UUID などを使用するのではなく、**実際に UI に表示される日本語テキストをマッチ対象として使用する**のが特徴です。

---

### 2. Vite Plugin が XML を読み込む

`tools/i18n/voicevoxI18nPlugin.ts` に実装された `voicevoxI18n()` が Vite Plugin として登録されています。

```ts
plugins: [
  voicevoxI18n(),
  vue(),
  ...
]
```

Vite の `configResolved()` のタイミングで、

```text
tools/i18n/locales/translates/group_*.xml
```

を検索・読み込みます。

XML 内の、

- `equals`
- `contains`
- `text`
- `param`
- 各 locale の `content`

を解析し、実行時に利用する `TranslationRule` へ変換します。

例えば概念的には、

```ts
{
  type: "equals",
  pattern: "...",
  flags: "u",
  parameters: [],
  translatableParameters: [],
  translation: "Settings"
}
```

のようなルールになります。

---

### 3. 翻訳ルールを Virtual Module に埋め込む

Vite Plugin は、

```text
virtual:voicevox-i18n/runtime
```

という Virtual Module を提供します。

この Virtual Module の中には、Vite の設定段階で解析・統合された翻訳ルールが JSON として埋め込まれます。

概念的には、

```ts
const rules = {
  "en-US": [...],
  "zh-CN": [...],
  "zh-TW": [...],
  "ko-KR": [...],
};

const runtime = createRuntime(rules);
```

という形で renderer bundle に組み込まれます。

そのため、アプリ実行時に XML ファイルを読み込んで解析する必要はありません。

---

### 4. アプリケーションの入口だけにランタイムを注入

この i18n Plugin は、アプリケーション全体の Vue/TypeScript ソースを変換するわけではありません。

対象となるのは以下の 2 つのエントリーポイントです。

```text
src/main.ts
src/welcome/main.ts
```

ここに、

```ts
createApp(App)
```

を検出して、

```ts
createApp(App)
  .use(installVoicevoxI18n)
```

というランタイムインストール処理を注入します。

つまり、

- Vue コンポーネントのテンプレートを書き換えない
- Vue SFC のテキストを AST 変換しない
- TypeScript の文字列リテラルを書き換えない
- 各コンポーネントへ `$t()` を追加する必要がない

という設計です。

**完全にソースコードへ変更を加えないわけではなく、i18n のための変更はアプリケーションエントリーポイントへの Vite ビルド時インジェクションに限定されています。**

---

## 5. 実際の翻訳はブラウザの DOM 上で行われる

重要なのは、**翻訳そのものは Vite のビルド時には行われない**という点です。

Vue が通常どおり UI をレンダリングした後、

```text
Vue rendering
    ↓
Japanese DOM
    ↓
VOICEVOX i18n runtime
    ↓
Translated DOM
```

という順番で処理されます。

ランタイムは `document.createTreeWalker()` を使用して、レンダリング済み DOM の Text Node を走査します。

例えば、

```html
<button>設定</button>
```

がレンダリングされた場合、

```text
TextNode("設定")
       ↓
TranslationRule を検索
       ↓
"Settings"
       ↓
TextNode を置換
```

という処理になります。

そのため、Vue のテンプレート自体を、

```vue
<button>{{ $t("settings") }}</button>
```

のように変更する必要はありません。

---

## 6. `equals` / `contains` によるマッチング

翻訳ルールには主に 2 種類のマッチ方式があります。

### `equals`

テキスト全体を一致させます。

```text
設定
↓
Settings
```

先頭・末尾の空白は保持されます。

### `contains`

テキストの一部分を検索して置換します。

これは動的な値を含む UI に使用できます。

例えば、

```text
ファイルが見つかりません: test.wav
```

のような文字列に対して、

```text
ファイルが見つかりません: {0}
```

というルールを定義し、

```text
File not found: {0}
```

へ変換できます。

---

## 7. 動的パラメータと 2 段階翻訳

`<param>` を使用すると、動的な値を翻訳ルール内のキャプチャグループとして扱えます。

例えば、

```xml
<match type="contains">
    <text content="エンジン: "/>
    <param name="engine"/>
</match>

<translate>
    <en-US content="Engine: {engine}"/>
</translate>
```

のようなルールを定義できます。

また、

```xml
<param name="engine" translate="allow"/>
```

とすることで、そのパラメータに対して**現在の locale の翻訳ルールをもう一度適用する 2 段階翻訳**を有効にできます。

テンプレート内では、

```text
{0}
```

が元のキャプチャ、

```text
[0]
```

が 2 段階目の翻訳結果を表します。

2 段階目で翻訳ルールが見つからない場合は、元の値へフォールバックします。

また、無限再帰を防ぐため、2 段階翻訳には最大深度が設定されています。

---

## 8. Text Node だけでなく UI 属性も翻訳

ランタイムは通常のテキストだけでなく、以下のユーザー向け属性も翻訳対象とします。

```text
title
aria-label
placeholder
alt
label
description
```

例えば、

```html
<input placeholder="名前を入力してください">
```

も翻訳対象になります。

一方、`id`、`class` などの内部的な属性は翻訳対象ではありません。

---

## 9. 翻訳してはいけないコンテンツは除外

ユーザーが入力したデータやコードなどが誤って翻訳されないよう、以下のような要素は除外されます。

```text
SCRIPT
STYLE
NOSCRIPT
PRE
CODE
TEXTAREA
OPTION
```

また、

```html
<div contenteditable="true">
```

のような編集可能なコンテンツや、

```html
<div data-vv-i18n-ignore="true">
```

を指定した要素も翻訳対象から除外されます。

---

## 10. MutationObserver による動的 UI への対応

VOICEVOX の UI には、初期レンダリング後に Vue / Quasar によって生成されるメニュー、ダイアログなどの動的コンテンツがあります。

そこでランタイムは `MutationObserver` を使用して DOM の変更を監視します。

```text
DOM mutation
     ↓
MutationObserver
     ↓
dirty = true
     ↓
requestAnimationFrame
     ↓
DOM scan
     ↓
translation
```

翻訳処理は `requestAnimationFrame` にスケジューリングされるため、短時間に発生する複数の DOM 更新をまとめて処理できます。

この仕組みにより、アプリケーション起動時に存在しなかった UI 要素も、DOM に追加された時点で翻訳対象になります。

---

## 11. ロケールの決定

現在の locale は、

```text
localStorage["voicevox.locale"]
```

を優先して決定します。

保存された locale が `auto`、または未設定の場合は、Electron 側から提供される優先システム言語、もしくはブラウザの、

```ts
navigator.languages
```

を利用して判定します。

例えば、

```text
ja-* → ja-JP
en-* → en-US
zh-Hans-* → zh-CN
zh-Hant-* → zh-TW
zh-Hant-HK / zh-HK → zh-HK
ko-* → ko-KR
```

のように locale を正規化します。

対応する locale を判定できない場合は、

```text
ja-JP
```

へフォールバックします。

`ja-JP` の場合はソース言語そのものなので、DOM の翻訳処理は実行されません。

---

## 12. `extract.ts` / `audit.ts` の役割

i18n には以下の補助ツールも含まれています。

```text
tools/i18n/extract.ts
tools/i18n/audit.ts
```

これらは翻訳対象の発見や翻訳カバレッジの確認に使用する**開発・メンテナンス用ツール**です。

重要なのは、これらは実際のアプリケーション実行時の翻訳処理には参加しないという点です。

実行時の翻訳は、

```text
XML
 ↓
Vite Plugin
 ↓
Virtual Module
 ↓
runtime.ts
 ↓
DOM
```

という経路で行われます。

## 13. Electron システム API のユーザー向け文字列も Proxy で翻訳

DOM 上に存在しない Electron のネイティブ UI についても、既存の翻訳ランタイムをそのまま再利用します。

例えばファイル選択ダイアログの場合、Vue / DOM の翻訳ではなく Electron API に渡される引数のうち、**実際にユーザーへ表示される文字列だけ**を renderer 側の Proxy 境界で翻訳します。

```text
既存のアプリケーションコード
        │
        ▼
window.backend.showOpenFileDialog(...)
        │
        ▼
Electron backend API Proxy
        │
        ├─ title ────────→ i18n runtime で翻訳
        ├─ name ─────────→ i18n runtime で翻訳
        ├─ extensions ───→ そのまま
        └─ defaultPath ──→ そのまま
        │
        ▼
IPC / Electron
        │
        ▼
Native file dialog
```

### 翻訳対象

現在は、以下の Electron システムダイアログ API のユーザー向け文字列を対象にしています。

| API | 翻訳対象 | そのまま渡す値 |
|---|---|---|
| `showSaveDirectoryDialog` | `title` | その他の引数 |
| `showOpenDirectoryDialog` | `title` | その他の引数 |
| `showOpenFileDialog` | `title`, `name` | `extensions`, `defaultPath` など |
| `showSaveFileDialog` | `title`, `name` | `extensions`, `defaultPath` など |

ここでいう `name` はファイルタイプとしてダイアログに表示される人間向けの名称です。一方、`extensions` は `wav` / `mp3` などの機械可読な拡張子なので翻訳しません。`defaultPath` も実ファイルパスであるため翻訳対象外です。

### 実装場所

Electron renderer 側の API bridge に翻訳処理を追加しています。主なファイルは以下です。

```text
src/backend/electron/renderer/
├── backendApiLoader.ts
├── preload.ts
└── systemDialogI18n.ts
```

`backendApiLoader.ts` の `unwrapApi()` は既存 API を `Proxy` で公開しているため、ここで対象 API の引数を検査し、翻訳対象として明示したフィールドだけを置換します。これにより、**既存の業務コード側で個別に翻訳処理を呼び出す必要はありません。**

翻訳は既存の runtime API、すなわち、概念的には次の処理を通ります。

```ts
globalThis.__VOICEVOX_I18N__?.text(scope, source)
```

そのため、DOM テキストと Electron ネイティブ UI の翻訳で、翻訳ルール・locale・フォールバックの仕組みを別々に持つ必要がありません。

### スコープ

Electron システム UI 用の翻訳では、例えば次のようなスコープを使用します。

```text
electron.showOpenFileDialog.title
electron.showOpenFileDialog.name
electron.showSaveFileDialog.title
electron.showSaveFileDialog.name
```

ただし翻訳ルール自体は既存の `text()` runtime を利用するため、特別な message-key ベースの翻訳システムを新設するものではありません。

### テスト

対象フィールドだけが翻訳され、パスや拡張子などが変更されないことを `tests/unit/i18nSystemDialogProxy.spec.ts` で検証しています。

```bash
pnpm exec vitest run tests/unit/i18nSystemDialogProxy.spec.ts
```

---

## 🔄 全体の処理フロー

最終的な処理フローは次のようになります。

```text
tools/i18n/locales/translates/group_*.xml
                │
                │ Vite configResolved
                ▼
      XML parsing / Rule generation
                │
                ▼
        TranslationRule[]
                │
                │ Virtual Module
                ▼
      virtual:voicevox-i18n/runtime
                │
                ▼
          renderer bundle
                │
                │ app startup
                ▼
      installVoicevoxI18nRuntime()
                │
                ▼
        createRuntime(rules)
                │
                ├── locale resolution
                │
                ├── RegExp compilation
                │
                └── MutationObserver
                         │
                         ▼
                    DOM changes
                         │
                         ▼
                   TreeWalker scan
                         │
                         ▼
                Text / Attributes
                         │
                         ▼
                  Rule matching
                         │
                         ▼
                   Translation
                         │
                         ▼
                 Localized DOM UI

Application code
      │
      ▼
window.backend.*
      │
      ▼
Electron API Proxy
      │
      ├── visible text fields ──→ existing i18n runtime
      │                            │
      │                            ▼
      │                     translated arguments
      │
      └── paths / extensions / IDs ─→ unchanged
      │
      ▼
IPC / Electron
      │
      ▼
Native system UI
```

---

## 🎯 この方式の目的

この方式は、既存の VOICEVOX Editor の UI コードを大規模に i18n 用 API へ書き換えることなく、多言語化することを目的としています。

従来型の方式では、

```vue
<button>{{ $t("settings") }}</button>
```

のように各コンポーネントを変更する必要があります。

本フォークでは、

```vue
<button>設定</button>
```

という既存コードを基本的に維持したまま、

```text
設定
 ↓
Translation Rule
 ↓
Settings
```

というランタイム処理によってローカライズします。

そのため、i18n の実装をアプリケーションのコンポーネント構造から分離し、**既存 UI コードへの侵入を最小限に抑える**ことができます。

Electron のネイティブ UI についても同じ考え方を適用し、UI として表示される引数だけを API 境界で翻訳します。これにより、DOM 外の文字列でも既存の翻訳ルールを再利用できます。

---

## ⚠️ この方式の制約

この方式では翻訳対象をソースコードの AST ではなく、**実際にレンダリングされた文字列**として扱います。

そのため、以下のような特性があります。

- 原文テキストの変更に翻訳ルールが影響される
- 同一の日本語文字列が異なる意味で使用されている場合、文脈を区別しにくい
- DOM を走査して翻訳するため、従来型の message-key i18n とは異なる性能特性を持つ
- 翻訳対象外にしたい動的コンテンツについては除外指定が必要になる場合がある

一方で、Vue のコンパイラ構造やコンポーネント単位の i18n API に依存せず、Quasar のメニューやダイアログなど、**後から DOM に追加される UI も同じ仕組みで処理できる**という特徴があります。

---

## 🚀 ビルド＆実行方法

開発環境の構築および基本的なビルド手順については、[本家 README](https://github.com/VOICEVOX/voicevox#readme) をご参照ください。

```bash
# パッケージのインストール
pnpm install

# 開発用起動 (Electron)
pnpm run electron:serve
```

i18n 関連の開発用コマンドも用意されています。

```bash
# 翻訳対象の抽出
pnpm run i18n:extract

# 翻訳カバレッジの監査
pnpm run i18n:audit

# コンポーネント単位の監査
pnpm run i18n:audit:components
```

---

## 📁 i18n 関連ファイル

```text
tools/i18n/
├── locales/
│   ├── languages.xml
│   ├── schemas/
│   │   ├── languages.xsd
│   │   └── translates.xsd
│   └── translates/
│       ├── group_001.xml
│       ├── group_002.xml
│       └── ...
│
├── extract.ts
├── audit.ts
├── runtime.ts
├── voicevoxI18nPlugin.ts
├── packAsar.ts
└── IMPLEMENTATION.md
```

Electron renderer 側の system API bridge は以下に配置されています。

```text
src/backend/electron/renderer/
├── backendApiLoader.ts
├── preload.ts
└── systemDialogI18n.ts
```

主な役割は以下のとおりです。

| ファイル | 役割 |
|---|---|
| `languages.xml` | 対応言語・翻訳バージョンなどのメタデータ |
| `translates/group_*.xml` | 翻訳ルール本体 |
| `voicevoxI18nPlugin.ts` | XML の読み込み、ルール生成、Virtual Module、入口へのランタイム注入 |
| `runtime.ts` | locale 解決、DOM 走査、ルール適用、MutationObserver |
| `extract.ts` | 翻訳対象文字列の抽出 |
| `audit.ts` | 翻訳状況の監査 |
| `packAsar.ts` | Electron 配布用 ASAR 関連処理 |
| `src/backend/electron/renderer/backendApiLoader.ts` | Electron backend API の Proxy。システム UI の表示文字列を翻訳してから既存 API を呼び出す |
| `src/backend/electron/renderer/systemDialogI18n.ts` | システムダイアログの翻訳対象フィールドを定義し、既存 i18n runtime を適用する |

---

## 📄 ライセンス / License

本プロジェクトは本家 VOICEVOX と同様に [LGPL v3](./LICENSE) ライセンスのもとで公開されています。
