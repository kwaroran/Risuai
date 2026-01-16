# fflate Streaming ZIP Patch

## Problem

fflate's streaming ZIP API always uses **Data Descriptor (bit 3 flag)**, which causes incorrect parsing when streaming decompression encounters signature-like bytes within file data.

### Background

- When bit 3 flag is set in ZIP format, the Local File Header contains 0 for size/crc, and a Data Descriptor is appended after the file data
- fflate's streaming ZIP compresses data as it receives it, so it cannot know the size in advance and always uses bit 3 flag
- During streaming decompression, if the Data Descriptor signature (`0x08074b50`) is found within file data, it causes incorrect parsing

## Solution: Two-pass + fflate Patch

### 1. processzip.ts Modification

Pre-compress with `deflateSync` to calculate compressed size, compute CRC with `crc32` function, then set on `ZipPassThrough`:

```typescript
// CRC32 calculation function
const crc32Table = (() => {
    const t = new Int32Array(256);
    for (let i = 0; i < 256; ++i) {
        let c = i, k = 9;
        while (--k) c = ((c & 1) && -306674912) ^ (c >>> 1);
        t[i] = c;
    }
    return t;
})();

function crc32(data: Uint8Array): number {
    let crc = -1;
    for (let i = 0; i < data.length; ++i) {
        crc = crc32Table[(crc & 255) ^ data[i]] ^ (crc >>> 8);
    }
    return ~crc >>> 0;
}

// Inside write method
const compressed = compressionLevel === 0
    ? dat
    : fflate.deflateSync(dat, { level: compressionLevel })
const crc = crc32(dat)

const file = new fflate.ZipPassThrough(key) as fflate.ZipPassThrough & {csize?: number}
file.size = dat.length           // uncompressed size
file.csize = compressed.length   // compressed size
file.crc = crc
file.compression = compressionLevel === 0 ? 0 : 8  // 0 = store, 8 = deflate

this.zip.add(file)
file.push(compressed, true)
```

### 2. fflate Patch (pnpm patch)

Two modifications in `patches/fflate@0.8.2.patch`:

#### 2.1 wzh() Call Modification

Use `file.csize` if set to avoid bit 3 flag:

```javascript
// Before
wzh(header, 0, file, f, u, -1);

// After
wzh(header, 0, file, f, u, file.csize != null ? file.csize : -1);
```

#### 2.2 ZipPassThrough.push() Method Modification

Preserve preset `crc`/`size` instead of overwriting:

```javascript
ZipPassThrough.prototype.push = function (chunk, final) {
    if (!this.ondata)
        err(5);
    var presetCrc = this.crc;
    var presetSize = this.size;
    this.c.p(chunk);
    if (presetSize === 0) {
        this.size += chunk.length;
    }
    if (final) {
        if (presetCrc == null) {
            this.crc = this.c.d();
        }
    }
    this.process(chunk, final || false);
};
```

## Result

- size/crc correctly written in Local File Header
- No Data Descriptor used (bit 3 = 0)
- Streaming decompression works correctly

## Applying the Patch

1. Ensure `patches/fflate@0.8.2.patch` file exists
2. Check `patchedDependencies` in `package.json`:
   ```json
   {
     "pnpm": {
       "patchedDependencies": {
         "fflate@0.8.2": "patches/fflate@0.8.2.patch"
       }
     }
   }
   ```
3. Run `pnpm install` to automatically apply the patch
