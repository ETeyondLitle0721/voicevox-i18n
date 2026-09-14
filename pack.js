import fs from 'node:fs';
import path from 'node:path';
import ignore from 'ignore';
import * as archiver from 'archiver';

async function packProject() {
    const cwd = process.cwd();

    // 1. 读取并解析 package.json 中的 name 字段
    const pkgPath = path.join(cwd, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        console.error('错误: 当前目录下未找到 package.json');
        process.exit(1);
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const zipFileName = `${pkg.name || 'archive'}.zip`;

    // 2. 初始化 ignore 实例并读取 .packignore
    const ig = ignore();
    const packignorePath = path.join(cwd, '.packignore');

    if (fs.existsSync(packignorePath)) {
        const packignoreContent = fs.readFileSync(packignorePath, 'utf-8');
        ig.add(packignoreContent);
    } else {
        console.log('未找到 .packignore 文件，将包含除默认忽略项外的所有文件。');
    }

    // 默认忽略常见的非源码文件及生成的压缩文件本身
    ig.add([zipFileName]);

    // 3. 递归遍历目录，收集未被忽略的文件路径
    function getIncludedFiles(dir, relativeDir = '') {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        let files = [];

        for (const entry of entries) {
            const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;

            // 检查路径是否被忽略（目录需加斜杠后缀判断）
            const checkPath = entry.isDirectory() ? `${relativePath}/` : relativePath;
            if (ig.ignores(checkPath)) {
                continue;
            }

            if (entry.isDirectory()) {
                files = files.concat(getIncludedFiles(path.join(dir, entry.name), relativePath));
            } else {
                files.push({
                    fullPath: path.join(dir, entry.name),
                    relativePath: relativePath
                });
            }
        }

        return files;
    }

    const filesToPack = getIncludedFiles(cwd);

    // 4. 创建 zip 压缩包
    const outputPath = path.join(cwd, zipFileName);
    const output = fs.createWriteStream(outputPath);
    const archive = new archiver.ZipArchive({ zlib: { level: 9 } });

    output.on('close', () => {
        console.log(`打包完成！已生成: ${zipFileName} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`);
    });

    archive.on('error', (err) => {
        throw err;
    });

    archive.pipe(output);

    // 将筛选出的文件追加到压缩包中
    for (const file of filesToPack) {
        archive.file(file.fullPath, { name: file.relativePath });
    }

    await archive.finalize();
}

packProject().catch(console.error);