import { piston, pistonJudger } from "piston-judger";

async function test() {
  const pistonUrl = "http://localhost:2000";
  const judger = pistonJudger({ server: pistonUrl });

  console.log("Testing piston at:", pistonUrl);
  
  const res = await judger.execute("python", "print('hello')", {
    run_timeout: 3000,
    run_memory_limit: 256 * 1024 * 1024
  } as any);
  
  console.log("Result:", JSON.stringify(res, null, 2));
}

test();
