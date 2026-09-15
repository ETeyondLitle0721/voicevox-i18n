const fs = require("node:fs");
const path = require("node:path");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");

// 文件路径配置
const inputPath = path.join(__dirname, "tools/i18n/locales/locales.xml");
const outputPath = path.join(__dirname, "tools/i18n/locales/output.xml");

function convertXml() {
  // 1. 读取原 XML 文件
  const xmlData = fs.readFileSync(inputPath, "utf8");

  // 2. 解析 XML DOM
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlData, "application/xml");

  // 3. 获取 <translates> 下所有的 <translate> 节点
  const translatesNode = doc.getElementsByTagName("translates")[0];
  if (!translatesNode) {
    console.error("未找到 <translates> 根节点");
    return;
  }

  // 避免 getElementsByTagName 动态更新干扰遍历，转为数组处理
  const oldTranslateNodes = Array.from(translatesNode.childNodes).filter(
    (node) => node.nodeType === 1 && node.tagName === "translate",
  );

  // 提取定义好的语言标签集合（除 match/param/text 等节点外的语言节点）
  const ignoreTags = new Set(["match", "#text", "#comment"]);

  oldTranslateNodes.forEach((oldTranslate) => {
    // 创建新的 <item> 节点并复制属性 (id)
    const itemNode = doc.createElement("item");
    if (oldTranslate.hasAttribute("id")) {
      itemNode.setAttribute("id", oldTranslate.getAttribute("id"));
    }

    // 创建内层的 <translate> 包装节点
    const innerTranslateNode = doc.createElement("translate");

    // 移动子节点
    const childNodes = Array.from(oldTranslate.childNodes);
    childNodes.forEach((child) => {
      if (child.nodeType === 1) {
        // 元素节点
        if (child.tagName === "match") {
          // <match> 保持放置在 <item> 直接层级
          itemNode.appendChild(child);
        } else if (!ignoreTags.has(child.tagName)) {
          // 语言节点（如 <zh-CN>, <en-US> 等）放入 <translate> 内部
          innerTranslateNode.appendChild(child);
        }
      } else if (child.nodeType === 3) {
        // 文本/换行格式节点
        // 简单保留原始缩进结构
        itemNode.appendChild(child.cloneNode(true));
      }
    });

    // 将组装好的 <translate> 追加到 <item> 中
    itemNode.appendChild(innerTranslateNode);

    // 替换旧节点
    translatesNode.replaceChild(itemNode, oldTranslate);
  });

  // 4. 序列化并写入目标文件
  const serializer = new XMLSerializer();
  let resultXml = serializer.serializeToString(doc);

  // 确保输出目录存在
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, resultXml, "utf8");

  console.log(`转换完成！文件已保存至: ${outputPath}`);
}

convertXml();
