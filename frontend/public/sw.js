self.addEventListener('push', function (event) {
  if (!event.data) {
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch (err) {
    data = {
      title: 'Notificación',
      body: event.data.text(),
    };
  }

  const options = {
    body: data.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: {
      leadId: data.leadId,
      appointmentId: data.appointmentId,
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Notificación', options)
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = '/agenda';

  if (data.leadId) {
    targetUrl = `/leads/${data.leadId}`;
  } else if (data.appointmentId) {
    targetUrl = `/agenda?appointmentId=${data.appointmentId}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // Intenta enfocar una pestaña abierta que ya esté en la app
      for (const client of clientList) {
        if ('focus' in client) {
          // Si está en la misma url o queremos redirigir
          if (client.url.includes(location.origin)) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
      }
      // Si no hay pestañas abiertas, abre una nueva
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
