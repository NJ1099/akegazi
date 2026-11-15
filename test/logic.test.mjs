/* 브라우저 없이 도는 순수 로직 검사. node test/logic.test.mjs */
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { decodeEntities, isAllowedImageUrl, nextImageUrl } from "../worker/worker.js";

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of ["js/util.js", "js/money.js", "js/geo.js", "js/store.js", "js/weather.js"]) {
  vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
}
const { money, geo, store, weather } = sandbox.TP;

let n = 0;
function ok(cond, msg) {
  assert.equal(!!cond, true, msg);
  n++;
}

ok(money.currencyForRegion("방콕") === "THB", "방콕은 바트");
ok(money.currencyForRegion("오사카") === "JPY", "오사카는 엔");
ok(money.currencyForRegion("인도네시아") === "IDR", "인도네시아는 루피아(루피보다 먼저)");
ok(money.currencyForRegion("뉴델리") === "INR", "델리는 루피");
ok(money.currencyForRegion("캐나다") === "CAD", "캐나다는 캐나다달러");
ok(money.currencyForRegion("") === null, "빈 지역은 추천 없음");

ok(weather.fmtTemp(null) === null, "기온 없음은 null (0도로 둔갑하지 않음)");
ok(weather.fmtTemp(undefined) === null, "undefined 기온");
ok(weather.fmtTemp(0) === 0, "0도는 유지");
ok(weather.fmtTemp(16.6) === 17, "기온 반올림");

const bad = store.defaultStop({
  title: "x".repeat(500),
  checkIn: "2026-02-31",
  checkOut: "2026-03-02",
  lat: 999,
  lon: 10,
  time: "25:99"
});
ok(bad.title.length === 120, "장소 이름 길이 상한");
ok(bad.checkIn === "" && bad.checkOut === "", "없는 날짜는 버린다");
ok(bad.lat === null && bad.lon === 10, "위도 범위 밖은 비운다");
ok(store.defaultStop({ checkIn: "2026-01-01&daily=1", checkOut: "2026-01-03" }).checkIn === "", "날짜에 파라미터를 못 붙인다");

const sched = geo.buildSchedule([
  { id: "a", type: "airport", arriveTime: "10:00", lat: 34.43, lon: 135.24 },
  { id: "b", type: "food", time: "15:00", lat: 34.67, lon: 135.50, stayMin: 60 },
  { id: "c", type: "cafe", lat: 34.68, lon: 135.51 }
]);
ok(sched.active, "공항 시각이 있으면 일정 계산");
ok(sched.items[1].etaArrive === 15 * 60, "직접 입력한 시각을 그대로 쓴다");
ok(sched.items[2].etaArrive != null && sched.items[2].etaArrive >= 15 * 60, "뒤 장소 ETA 는 앞 시각보다 이르게 가지 않는다");

ok(decodeEntities("A &amp; B &#39; C") === "A & B ' C", "HTML 엔티티");
ok(decodeEntities("&#x1F600;") === "😀", "이모지 코드포인트");
ok(decodeEntities("ok&#x110000;end&#999999999;") === "okend", "범위 밖 코드포인트는 예외 없이 버린다");
ok(decodeEntities("&#xD800;") === "", "서로게이트는 버린다");

ok(isAllowedImageUrl("https://scontent.cdninstagram.com/v/a.jpg?stp=1"), "인스타 CDN");
ok(isAllowedImageUrl("https://instagram.fna.fbcdn.net/v/b.jpg"), "fbcdn");
ok(!isAllowedImageUrl("http://scontent.cdninstagram.com/v/a.jpg"), "http 는 거절");
ok(!isAllowedImageUrl("https://user:pass@scontent.cdninstagram.com/v/a.jpg"), "계정 정보가 있으면 거절");
ok(!isAllowedImageUrl("https://cdninstagram.com.evil.com/v/a.jpg"), "뒤에 붙은 가짜 도메인");
ok(!isAllowedImageUrl("https://evil.com/scontent.cdninstagram.com/a.jpg"), "경로에만 있는 CDN 이름");
ok(!isAllowedImageUrl("not a url"), "깨진 주소");

const cdn = "https://scontent.cdninstagram.com/old";
ok(nextImageUrl(cdn, "/v/a.jpg") === "https://scontent.cdninstagram.com/v/a.jpg", "같은 호스트 상대 리다이렉트");
ok(nextImageUrl(cdn, "https://instagram.fna.fbcdn.net/v/b.jpg") === "https://instagram.fna.fbcdn.net/v/b.jpg", "허용된 다른 CDN 으로의 이동");
ok(nextImageUrl(cdn, "https://169.254.169.254/") === null, "내부 주소로 안 따라감");
ok(nextImageUrl(cdn, "https://evil.com/x") === null, "다른 사이트로 안 따라감");

console.log("ok " + n);
