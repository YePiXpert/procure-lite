"""Run explicitly in the production image with --network none --cpus 2 --memory 4g."""
import asyncio
import json
import resource
from pathlib import Path
import time
from app.ocr import warmup

async def main():
    start=time.monotonic()
    await warmup()
    cold=time.monotonic()-start
    times=[]
    rss=[]
    for _ in range(12):
        start=time.monotonic()
        result=await warmup()
        assert any('12345' in x['text'].replace(' ','') for x in result)
        times.append(time.monotonic()-start)
        rss.append(int(next(line.split()[1] for line in Path("/proc/self/status").read_text().splitlines() if line.startswith("VmRSS:"))))
    report={'sample':'synthetic OCR 12345 (not a business accuracy evaluation)','cold_seconds':cold,'hot_p95_seconds':sorted(times)[-1],'peak_rss_kb':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'rss_first_kb':rss[0],'rss_last_kb':rss[-1],'runs':len(times)}
    assert report['hot_p95_seconds']<30
    assert report['peak_rss_kb']<4*1024*1024
    assert max(rss[-3:])-max(rss[:3])<64*1024, 'Synthetic steady-state memory grew by over 64MB'
    print(json.dumps(report))

if __name__=='__main__': asyncio.run(main())
