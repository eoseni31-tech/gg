import '/config.js';if(location.pathname==='/admin')await import('/admin.js');else if(location.pathname==='/reset-password')await import('/recovery.js');else await import('/dashboard.js');
