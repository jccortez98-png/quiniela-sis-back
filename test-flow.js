const { MongoClient, ObjectId } = require('mongodb');
const API_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🚀 Iniciando pruebas de flujo Quiniela...\n');

  // Setup DB client and get 2 favorite teams
  const client = new MongoClient('mongodb://127.0.0.1:27017');
  await client.connect();
  const db = client.db('quiniela');

  // Ensure 2 teams exist
  let teams = await db.collection('teams').find().limit(2).toArray();
  if (teams.length < 2) {
    console.log('📝 Creando selecciones de prueba en MongoDB...');
    const dummyTeams = [
      { name: 'Guatemala Test', flag: '🇬🇹' },
      { name: 'Argentina Test', flag: '🇦🇷' }
    ];
    await db.collection('teams').insertMany(dummyTeams);
    teams = await db.collection('teams').find().limit(2).toArray();
  }
  const favoriteTeams = teams.map(t => t._id.toString());
  console.log(`✅ Selecciones favoritas para registro: [${teams.map(t => t.name).join(', ')}]`);

  // Generate unique nicknames and emails so tests can run repeatedly
  const timestamp = Date.now();
  const userEmail = `user_${timestamp}@test.com`;
  const adminEmail = `admin_${timestamp}@test.com`;
  const userNickname = `VacaLoca_${timestamp}`;
  const adminNickname = `Admin_${timestamp}`;

  let userToken = '';
  let adminToken = '';
  let userId = '';
  let adminId = '';
  let matchIdFuture = '';
  let matchIdSoon = '';
  let jackpotRequestId = '';

  // Helper for requests
  async function apiCall(path, method, body = null, token = null) {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });
    const status = response.status;
    const data = await response.json().catch(() => ({}));
    return { status, data };
  }

  // 1. Register User
  console.log('1. Registrando usuario normal...');
  const regUser = await apiCall('/users/register', 'POST', {
    email: userEmail,
    password: 'password123',
    realName: 'Jose Test',
    nickname: userNickname,
    favoriteTeams: favoriteTeams,
    gender: 'male',
    age: 25,
  });
  if (regUser.status === 201 && regUser.data.access_token) {
    userToken = regUser.data.access_token;
    userId = regUser.data.user.id;
    console.log(`✅ Usuario registrado. ID: ${userId}, Nickname: ${userNickname}`);
  } else {
    console.error('❌ Registro de usuario fallido:', regUser.data);
    await client.close();
    return;
  }

  // 2. Register Admin
  console.log('\n2. Registrando usuario admin...');
  const regAdmin = await apiCall('/users/register', 'POST', {
    email: adminEmail,
    password: 'password123',
    realName: 'Jose Admin',
    nickname: adminNickname,
    favoriteTeams: favoriteTeams,
    gender: 'female',
    age: 30,
  });
  if (regAdmin.status === 201 && regAdmin.data.access_token) {
    adminToken = regAdmin.data.access_token;
    adminId = regAdmin.data.user.id;
    console.log(`✅ Admin registrado. ID: ${adminId}, Nickname: ${adminNickname}`);

    console.log('🔑 Promoviendo usuario a admin en MongoDB...');
    await db.collection('users').updateOne(
      { _id: new ObjectId(adminId) },
      { $set: { role: 'admin' } }
    );
    console.log('✅ Admin promovido en base de datos.');
  } else {
    console.error('❌ Registro de admin fallido:', regAdmin.data);
    await client.close();
    return;
  }

  // 3. Admin creates matches
  console.log('\n3. Creando partidos desde cuenta Admin...');
  // Match 1: In the future (starts in 2 hours)
  const dateFuture = new Date();
  dateFuture.setHours(dateFuture.getHours() + 2);
  const createMatch1 = await apiCall('/matches', 'POST', {
    homeTeam: { name: 'Guatemala', flag: '🇬🇹' },
    awayTeam: { name: 'Argentina', flag: '🇦🇷' },
    date: dateFuture.toISOString(),
    stage: 'Fase de Grupos',
  }, adminToken);

  if (createMatch1.status === 201) {
    matchIdFuture = createMatch1.data._id;
    console.log(`✅ Partido futuro creado: Guatemala vs Argentina. ID: ${matchIdFuture}`);
  } else {
    console.error('❌ Fallo al crear partido futuro:', createMatch1.data);
    return;
  }

  // Match 2: Locked (starts in 2 minutes)
  const dateSoon = new Date();
  dateSoon.setMinutes(dateSoon.getMinutes() + 2);
  const createMatch2 = await apiCall('/matches', 'POST', {
    homeTeam: { name: 'Brasil', flag: '🇧🇷' },
    awayTeam: { name: 'Alemania', flag: '🇩🇪' },
    date: dateSoon.toISOString(),
    stage: 'Fase de Grupos',
  }, adminToken);

  if (createMatch2.status === 201) {
    matchIdSoon = createMatch2.data._id;
    console.log(`✅ Partido cercano (bloqueado) creado: Brasil vs Alemania. ID: ${matchIdSoon}`);
  } else {
    console.error('❌ Fallo al crear partido cercano:', createMatch2.data);
    return;
  }

  // 4. Test Lock: Prediction for match starting in 2 mins
  console.log('\n4. Probando restricción de tiempo (partido empieza en 2 minutos)...');
  const predictSoon = await apiCall('/predictions', 'POST', {
    matchId: matchIdSoon,
    type: 'general',
    predictedScore: { home: 2, away: 1 }
  }, userToken);
  if (predictSoon.status === 400) {
    console.log('✅ Bloqueo de 10 minutos funciona! Error retornado:', predictSoon.data.message);
  } else {
    console.error('❌ ERROR: Se permitió predicción en partido bloqueado. Status:', predictSoon.status, predictSoon.data);
  }

  // 5. Test General Gatekeeper: Predict general without enrollment
  console.log('\n5. Probando Gatekeeper General (usuario no inscrito en quiniela general)...');
  const predictGeneralLocked = await apiCall('/predictions', 'POST', {
    matchId: matchIdFuture,
    type: 'general',
    predictedScore: { home: 1, away: 0 }
  }, userToken);
  if (predictGeneralLocked.status === 400) {
    console.log('✅ Bloqueo General funciona! Error retornado:', predictGeneralLocked.data.message);
  } else {
    console.error('❌ ERROR: Se permitió predicción general sin inscripción. Status:', predictGeneralLocked.status, predictGeneralLocked.data);
  }

  // 6. Test Jackpot Gatekeeper: Predict jackpot without request
  console.log('\n6. Probando Gatekeeper Jackpot (sin haber solicitado ingreso)...');
  const predictJackpotNoReq = await apiCall('/predictions', 'POST', {
    matchId: matchIdFuture,
    type: 'jackpot',
    predictedScore: { home: 1, away: 1 }
  }, userToken);
  if (predictJackpotNoReq.status === 400) {
    console.log('✅ Bloqueo Jackpot (sin solicitud) funciona! Error retornado:', predictJackpotNoReq.data.message);
  } else {
    console.error('❌ ERROR: Se permitió predicción jackpot sin solicitud. Status:', predictJackpotNoReq.status, predictJackpotNoReq.data);
  }

  // 7. User requests jackpot
  console.log('\n7. Enviando solicitud de ingreso al Jackpot...');
  const reqJackpot = await apiCall('/jackpot-requests/request', 'POST', {
    matchId: matchIdFuture
  }, userToken);
  if (reqJackpot.status === 201) {
    jackpotRequestId = reqJackpot.data._id;
    console.log(`✅ Solicitud enviada. ID: ${jackpotRequestId}, Estado: ${reqJackpot.data.status}`);
  } else {
    console.error('❌ Error al solicitar jackpot:', reqJackpot.data);
    return;
  }

  // 8. Test Jackpot Gatekeeper: Predict jackpot with pending request
  console.log('\n8. Probando Gatekeeper Jackpot (con solicitud PENDIENTE)...');
  const predictJackpotPending = await apiCall('/predictions', 'POST', {
    matchId: matchIdFuture,
    type: 'jackpot',
    predictedScore: { home: 1, away: 1 }
  }, userToken);
  if (predictJackpotPending.status === 400) {
    console.log('✅ Bloqueo Jackpot (solicitud pendiente) funciona! Error retornado:', predictJackpotPending.data.message);
  } else {
    console.error('❌ ERROR: Se permitió predicción jackpot con solicitud pendiente. Status:', predictJackpotPending.status, predictJackpotPending.data);
  }

  // 9. Admin approves general enrollment
  console.log('\n9. Admin inscribe al usuario en la Quiniela General...');
  // Note: we'll implement toggleGeneralEnrollment in the admin module in Step 3.
  // For Step 2 verification, let's update MongoDB directly to toggle general enrollment.
  await db.collection('users').updateOne(
    { _id: new ObjectId(userId) },
    { $set: { isEnrolledGeneral: true } }
  );
  console.log('✅ Usuario inscrito en la Quiniela General en base de datos.');

  // 10. User predicts general (should succeed)
  console.log('\n10. Enviando predicción general con usuario inscrito...');
  const predictGeneralOk = await apiCall('/predictions', 'POST', {
    matchId: matchIdFuture,
    type: 'general',
    predictedScore: { home: 2, away: 1 }
  }, userToken);
  if (predictGeneralOk.status === 201) {
    console.log('✅ Predicción General exitosa!', predictGeneralOk.data.predictedScore);
  } else {
    console.error('❌ Fallo al guardar predicción general:', predictGeneralOk.data);
  }

  // 11. Admin approves jackpot request
  console.log('\n11. Admin aprueba la solicitud de Jackpot...');
  const approveJackpot = await apiCall(`/jackpot-requests/${jackpotRequestId}/approve`, 'PATCH', {}, adminToken);
  if (approveJackpot.status === 200) {
    console.log(`✅ Solicitud de Jackpot aprobada! Nuevo estado: ${approveJackpot.data.status}`);

    // Verify Match jackpot pot incremented
    const updatedMatch = await apiCall(`/matches/${matchIdFuture}`, 'GET');
    console.log(`💰 Pot de Jackpot del Partido actualizado: Q${updatedMatch.data.jackpotPot}`);
  } else {
    console.error('❌ Error al aprobar jackpot:', approveJackpot.data);
    return;
  }

  // 12. User predicts jackpot (should succeed)
  console.log('\n12. Enviando predicción jackpot con solicitud aprobada...');
  const predictJackpotOk = await apiCall('/predictions', 'POST', {
    matchId: matchIdFuture,
    type: 'jackpot',
    predictedScore: { home: 1, away: 1 }
  }, userToken);
  if (predictJackpotOk.status === 201) {
    console.log('✅ Predicción Jackpot exitosa!', predictJackpotOk.data.predictedScore);
  } else {
    console.error('❌ Fallo al guardar predicción jackpot:', predictJackpotOk.data);
  }

  // 13. Get user's predictions
  console.log('\n13. Obteniendo predicciones del usuario...');
  const myPredictions = await apiCall('/predictions/me', 'GET', null, userToken);
  if (myPredictions.status === 200) {
    console.log(`✅ Predicciones recuperadas: ${myPredictions.data.length} registros.`);
    let autoZeroZeroFound = false;
    myPredictions.data.forEach(p => {
      console.log(`   - Tipo: ${p.type}, Predicción: ${p.predictedScore.home}-${p.predictedScore.away}, Partido: ${p.matchId}`);
      if (p.matchId === matchIdSoon && p.type === 'general' && p.predictedScore.home === 0 && p.predictedScore.away === 0) {
        autoZeroZeroFound = true;
      }
    });
    if (autoZeroZeroFound) {
      console.log('✅ Verificación de autocreación de predicción 0-0 exitosa!');
    } else {
      console.error('❌ ERROR: No se encontró la predicción autocreada 0-0 para el partido bloqueado.');
    }
  } else {
    console.error('❌ Fallo al recuperar predicciones:', myPredictions.data);
  }

  await client.close();
  console.log('\n🏁 Pruebas de flujo completadas con éxito!');
}

runTests().catch(err => {
  console.error('💥 Error inesperado durante las pruebas:', err);
});
