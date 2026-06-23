const https = require('https');

const SUPABASE_URL = 'htniaydnybggrdbylswa.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6Imh0bmlheWRueWJnZ3JkYnlsc3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjYzODEwNiwiZXhwIjoyMDY4MjE0MTA2fQ.gwwjvKPBGFgcUdGyzEy7fB_TD_kzUzFitu3CwDksvCo';

function request(method, path, body = null) {
	return new Promise((resolve, reject) => {
		const options = {
			hostname: SUPABASE_URL,
			path,
			method,
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
				'apikey': SERVICE_ROLE_KEY,
			},
		};

		if (body) {
			const raw = JSON.stringify(body);
			options.headers['Content-Length'] = Buffer.byteLength(raw);
		}

		const req = https.request(options, (res) => {
			let data = '';
			res.on('data', (chunk) => (data += chunk));
			res.on('end', () => {
				try {
					resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
				} catch {
					resolve({ status: res.statusCode, data });
				}
			});
		});

		req.on('error', reject);
		if (body) req.write(JSON.stringify(body));
		req.end();
	});
}

(async () => {
	const authRes = await request('GET', '/auth/v1/admin/users?per_page=100');
	const profilesRes = await request('GET', '/rest/v1/profiles?select=full_name,username,email,user_id&full_name=eq.%EA%B9%80%EC%84%B1%EA%B3%A4');
	const kimJinhoProfile = await request('GET', '/rest/v1/profiles?select=full_name,username,email,user_id&full_name=eq.%EA%B9%80%EC%A7%84%ED%98%B8');

	console.log('auth status', authRes.status);
	console.log('profile 김진호', JSON.stringify(kimJinhoProfile.data, null, 2));
	console.log('profile 김성곤', JSON.stringify(profilesRes.data, null, 2));
	console.log('first auth user', JSON.stringify((authRes.data.users || [])[0], null, 2));
})();
