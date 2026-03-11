const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');

const extensionConfig = {
    entryPoints: ['./src/extension.ts'],
    bundle: true,
    outfile: './out/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'es2022',
    sourcemap: true,
    minify: false,
};

async function build() {
    if (isWatch) {
        const ctx = await esbuild.context(extensionConfig);
        await ctx.watch();
        console.log('[esbuild] Watching for changes...');
    } else {
        await esbuild.build(extensionConfig);
        console.log('[esbuild] Build complete.');
    }
}

build().catch((err) => {
    console.error(err);
    process.exit(1);
});
