/* Tests for the extension's logic. Run: TZ=Asia/Kolkata node redpro-extension/test_lib.js */
process.env.TZ = process.env.TZ || 'Asia/Kolkata';
const R = require('./lib.js');

let fails = 0;
const check = (name, cond) => { console.log((cond ? '  ok  ' : ' FAIL ') + name); if (!cond) fails++; };
const none = (obj, ...vals) => !vals.some((v) => JSON.stringify(obj).includes(v));

// Shapes from redPro (8 Oct 2026) with every personal value replaced.
const REVIEW = { tin: 'TVB276345240', pnr: '251402880', name: 'Some Passenger', mobileNo: '919000000001',
  sourceLocation: 'Lucknow', destinationLocation: 'Kanpur (Uttar Pradesh)', dojInLocal: '2026-10-07 06:15:00',
  finalFare: '249', routeId: '46346772', reviewId: '770001', reviewStatus: 'CONFIRMED', seatName: ['L10', 'L9'],
  ratingData: { value: 2, submittedOn: '2026-10-07T14:30:56' },
  reviewData: { userComment: 'Bus felt cheap', opReply: { reply: 'Thank you', status: 'NEW' }, tags: ['Cleanliness'] } };
const COMPLAINT = { custName: 'Some Passenger', custEmailId: 'p@example.com', phoneNo: '9000000002', doj: '2026-09-08 03:00:00',
  status: 'Closed', createdDateTime: '2026-09-08 02:35:46', subIssueType: 'I was not allowed to board the bus', caseNumber: '33967620',
  pnr: '248659731', source: 'Rampur', destination: 'Muzaffarnagar', ticketAmount: 'INR 1048.95', noOfSeats: 1,
  caseComment: [{ commentorName: 'Agent Name', comment: 'Called BO', createdTime: '2026-09-08 20:04:25' }] };
const ASSIGN = { serviceNo: 'MHLKOTA-RISHIKESH-0500PM', originCity: 'Kota', destCity: 'Rishikesh', startTime: '17:00:00',
  vehicleNo: 'MP44ZF2103', driver1Name: 'Bheru', driver1Mobile: '9000000003', croMobile: '9000000004', serviceID: '125687', isRunning: true };

const r = R.mapReview(REVIEW);
check('review: no passenger name or phone', none(r, 'Some Passenger', '919000000001') && !('name' in r) && !('mobileNo' in r));
check('review: keeps PNR, route, boarding time, stars, tags', r.pnr === '251402880' && r.routeId === '46346772' && r.boardAt === '2026-10-07 06:15:00' && r.stars === 2 && r.tags[0] === 'Cleanliness' && r.replied);
const c = R.mapComplaint(COMPLAINT);
check('complaint: no customer details, no agent name', none(c, 'Some Passenger', 'p@example.com', '9000000002', 'Agent Name'));
check('complaint: notes keep time and text', JSON.stringify(c.notes) === JSON.stringify([{ at: '2026-09-08 20:04:25', text: 'Called BO' }]));
const a = R.mapAssignment(ASSIGN);
check('assignment: names kept, phones dropped', a.driver1 === 'Bheru' && none(a, '9000000003', '9000000004') && a.serviceId === '125687');

const sw = R.parseServicewise({ data: { services: [
  { serviceId: 125291, serviceName: '21:30, Meerut - Jaipur (Rajasthan)', routes: [{ routeId: 46026242 }, { routeId: '46026243' }] },
  { service_id: '125687', label: '17:00, Kota - Rishikesh', routeIds: [46346772] }] } });
const byId = Object.fromEntries(sw.map((x) => [x.serviceId, x]));
check('servicewise: nested route objects', JSON.stringify(byId['125291'].routeIds) === '["46026242","46026243"]' && byId['125291'].startTime === '21:30');
check('servicewise: plain route id list', JSON.stringify(byId['125687'].routeIds) === '["46346772"]');
check('servicewise: nothing recognisable → empty', R.parseServicewise({ data: [{ x: 1 }] }).length === 0);

const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi).getTime();
check('never ran → due', ['reviews', 'complaints', 'services'].every((j) => R.due(j, at(2026, 10, 8, 10, 0), {})));
check('slot already done → not due', !R.due('reviews', at(2026, 10, 8, 12, 0), { reviews: { last: at(2026, 10, 8, 6, 20) } }));
check('next slot → due', R.due('reviews', at(2026, 10, 8, 18, 16), { reviews: { last: at(2026, 10, 8, 6, 20) } }));
check('missed slot caught up within 6 h', R.due('complaints', at(2026, 10, 8, 15, 0), { complaints: { last: at(2026, 10, 8, 7, 31) } }));
check('missed slot older than 6 h → skipped', !R.due('complaints', at(2026, 10, 8, 6, 0), { complaints: { last: at(2026, 10, 7, 19, 31) } }));
check('assignments hourly', R.due('assignments', at(2026, 10, 8, 21, 0), { assignments: { last: at(2026, 10, 8, 20, 0) } })
  && !R.due('assignments', at(2026, 10, 8, 20, 30), { assignments: { last: at(2026, 10, 8, 20, 0) } }));
check('no assignment reads 02:00–05:00', !R.due('assignments', at(2026, 10, 8, 3, 0), {}));

check('first reviews run reads 45 days', R.reviewWindow(at(2026, 10, 8, 6, 15), {}).start === 20260824);
check('morning run reads 14 days', R.reviewWindow(at(2026, 10, 8, 6, 15), { reviews: { last: 1 } }).start === 20260924);
check('evening run reads 3 days', R.reviewWindow(at(2026, 10, 8, 18, 15), { reviews: { last: 1 } }).start === 20261005);
check('reviews body is what redPro sent on 8 Oct', JSON.stringify(R.reviewsBody({ start: 20260917, end: 20261008 })) ===
  '{"filterBy":{"operatorId":"5269","startDateInLong":20260917,"endDateInLong":20261008,"country":"IND","status":"all"},"sortBy":{"doj":true},"orderBy":{"order":"DESC"},"countValue":true}');

check('badge: problem shows !', R.badge({ problem: 'redPro signed out' }, Date.now()).text === '!');
check('badge: recent sync OK', R.badge({ assignments: { last: at(2026, 10, 8, 20, 0) } }, at(2026, 10, 8, 20, 30)).text === 'OK');
check('badge: 4 h without a sync is OLD', R.badge({ assignments: { last: at(2026, 10, 8, 14, 0) } }, at(2026, 10, 8, 18, 30)).text === 'OLD');

console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
