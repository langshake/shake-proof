# 📊 LangShake vs Traditional Crawling Report

**Domain:** `https://xevi.work`  
**Total Pages Crawled:** `8`  
**Schemas Match:** ✅ Yes  
**Merkle Roots Match:** ✅ Yes  
**LangShake Merkle Root Valid:** ✅  
**Traditional Merkle Root Valid:** ✅

---

## 📈 Benchmark Summary Table

| Metric                        | LangShake             | Traditional Crawling   | Diff / Savings            |
|------------------------------|------------------------|-------------------------|----------------------------|
| ⏱️ Total Duration            | 967ms                | 6.52s (6521ms)               | **~6.7x faster**             |
| 🧠 CPU Time (User+System)    | 45.83 ms             | 414.47 ms             | **~89% less CPU used**     |
| 💾 Peak Memory (RSS)         | 91.2 MB               | 108.1 MB               | **~16% less RAM used**     |
| 🌐 Total Downloaded Data     | 24.6 kB               | 642.9 kB               | **~96% less data**         |
| 🌐 Requests Made             | 9                     | 8                      | Similar                    |
| 🚀 Avg Request Time          | 409ms                | 2.80s (2802ms)               | **~85% faster per request**|
| 📦 Download RPS              | 9.31 req/s            | 1.23 req/s             | **~7.6x faster**             |
| 🧵 Max Concurrency           | 5               | 5               | Same |
| 📊 Status Codes              | 200: 9          | 200: 8           | - |
| ❌ Errors Encountered        | 0                     | 0                      | ✅ Stable on both sides    |
| ✅ Schemas Match             | ✅ All Match           | ✅ All Match            | ✅ Equivalent Accuracy     |

---

## 🔍 Per-Page Checksums

| Page URL | Checksum Match | LangShake Checksum | Traditional Checksum |
|----------|----------------|--------------------|-----------------------|
| [https://xevi.work/about](https://xevi.work/about) | ✅ | `305925da57862765226d286dbb2b7c23034d7e3cade0f7564883678c6a4843e1` | `305925da57862765226d286dbb2b7c23034d7e3cade0f7564883678c6a4843e1` |
| [https://xevi.work/blog](https://xevi.work/blog) | ✅ | `1b8a1e84323fbffc0aef4e7aad6ea52cf37407cbac2e2606b1b35851b535b96f` | `1b8a1e84323fbffc0aef4e7aad6ea52cf37407cbac2e2606b1b35851b535b96f` |
| [https://xevi.work/blog/speech-international-tech-submit](https://xevi.work/blog/speech-international-tech-submit) | ✅ | `0e28f16239b5aaacef21c0214fa3cd82e21d8c5038833ba07e97c0222c68b23d` | `0e28f16239b5aaacef21c0214fa3cd82e21d8c5038833ba07e97c0222c68b23d` |
| [https://xevi.work](https://xevi.work) | ✅ | `d331a28b4568528974860d703cde8b1dac5275e82449ece217c51e4b6882eee4` | `d331a28b4568528974860d703cde8b1dac5275e82449ece217c51e4b6882eee4` |
| [https://xevi.work/podcast](https://xevi.work/podcast) | ✅ | `062446b963d1ff5d2641899148744ccdd7eaaca6d31c0bf2134d81ca5068f9ec` | `062446b963d1ff5d2641899148744ccdd7eaaca6d31c0bf2134d81ca5068f9ec` |
| [https://xevi.work/work](https://xevi.work/work) | ✅ | `3a4c65f50c54b40b1f6f0b88744837e4f2a1dbfa76c4726f95964ff21e9fb992` | `3a4c65f50c54b40b1f6f0b88744837e4f2a1dbfa76c4726f95964ff21e9fb992` |
| [https://xevi.work/work/nftool-gas-analysis](https://xevi.work/work/nftool-gas-analysis) | ✅ | `f0f19d9d71a2a300fc97256830bf4a1a4a2932d1f7de614a75afb8b65023a17f` | `f0f19d9d71a2a300fc97256830bf4a1a4a2932d1f7de614a75afb8b65023a17f` |
| [https://xevi.work/work/recognize-any-artwork-ai](https://xevi.work/work/recognize-any-artwork-ai) | ✅ | `57aa8d2a3798b9dd2119e76417057ae45587171176f9bd565a3c1f03f177e606` | `57aa8d2a3798b9dd2119e76417057ae45587171176f9bd565a3c1f03f177e606` |

---

## 🛡️ Merkle Roots Validation

```json
{
  "LangShake": "00128a62d223c3f2f588fa844e1edb2fa450bc22f59e2fdafe151f97a4766963",
  "Traditional": "00128a62d223c3f2f588fa844e1edb2fa450bc22f59e2fdafe151f97a4766963",
  "LlmJson": "00128a62d223c3f2f588fa844e1edb2fa450bc22f59e2fdafe151f97a4766963"
}
``` 