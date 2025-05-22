/**
 * main.js - Main frontend JavaScript for the NIFTY Options Viewer
 * Handles authentication, dashboard, and real-time market data
 */

// ===== Socket.IO Connection Setup =====
let socket;
let marketData = {};
let optionsData = [];
let currentExpiry = '';
let selectedStrike = null;
let autoRefreshInterval;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
  // Check if user is logged in
  const authToken = localStorage.getItem('authToken');
  
  // Determine which page we're on
  const isLoginPage = document.getElementById('loginForm') !== null;
  const isDashboardPage = document.getElementById('dashboard') !== null;
  
  if (isLoginPage) {
    setupLoginForm();
  } else if (isDashboardPage) {
    if (!authToken) {
      // Redirect to login if not authenticated
      window.location.href = '/';
    } else {
      initializeDashboard();
    }
  }
});

// ===== Authentication Functions =====

function setupLoginForm() {
  const loginForm = document.getElementById('loginForm');
  if (!loginForm) return;
  
  loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('loginSubmit');
    const clientId = document.getElementById('clientId').value.trim();
    const password = document.getElementById('password').value;
    const totpInput = document.getElementById('totp').value.trim();
    
    // Disable button and show loading state
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';
    
    // Create the payload
    const payload = { clientId, password };
    
    // Only include totp if the user has entered a value (and it should be 6 digits)
    if (totpInput) {
      // Validate that it's 6 digits before sending
      if (/^\d{6}$/.test(totpInput)) {
        payload.totp = totpInput;
      } else {
        showLoginError('TOTP must be 6 digits');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
        return;
      }
    }
    
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      
      if (data.status) {
        // Login successful
        console.log('Login successful!', data);
        localStorage.setItem('authToken', 'logged_in');
        localStorage.setItem('clientId', clientId);
        
        // Redirect to dashboard
        window.location.href = '/dashboard';
      } else {
        // Login failed
        showLoginError(data.message || 'Login failed');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
      }
    } catch (error) {
      showLoginError('Network error. Please try again.');
      console.error('Login error:', error);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Login';
    }
  });
  
  // Additional form behaviors
  const togglePassword = document.getElementById('togglePassword');
  if (togglePassword) {
    togglePassword.addEventListener('click', function() {
      const passwordInput = document.getElementById('password');
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      // Toggle icon class if using an icon
      this.querySelector('i').classList.toggle('fa-eye');
      this.querySelector('i').classList.toggle('fa-eye-slash');
    });
  }
}

function showLoginError(message) {
  const errorElement = document.getElementById('loginError');
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    errorElement.classList.add('alert-danger');
    
    // Auto-hide error after 5 seconds
    setTimeout(() => {
      errorElement.style.display = 'none';
    }, 5000);
  }
}

function logout() {
  // Call the logout API
  fetch('/api/logout', {
    method: 'POST'
  })
  .then(response => response.json())
  .then(data => {
    // Clear local storage
    localStorage.removeItem('authToken');
    localStorage.removeItem('clientId');
    
    // Clear any active intervals
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
    }
    
    // Disconnect socket if connected
    if (socket && socket.connected) {
      socket.disconnect();
    }
    
    // Redirect to login page
    window.location.href = '/';
  })
  .catch(error => {
    console.error('Logout error:', error);
    // Even on error, redirect to login
    window.location.href = '/';
  });
}

// ===== Dashboard Functions =====

function initializeDashboard() {
  showNotification('Initializing dashboard...', 'info');
  
  // Initialize Socket.IO connection
  socket = io({
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });
  
  // Set up socket event listeners
  setupSocketListeners();
  
  // Fetch and populate expiry dropdown
  fetchExpiryDates();
  
  // Set up dashboard UI handlers
  setupDashboardUI();
  
  // Update user info
  updateUserInfo();
  
  // Fetch initial market data
  fetchMarketData();
  
  // Set up auto-refresh (every 30 seconds)
  autoRefreshInterval = setInterval(() => {
    fetchMarketData();
    if (currentExpiry) {
      fetchOptionsData(currentExpiry);
    }
  }, 30000);
}

function setupSocketListeners() {
  socket.on('connect', () => {
    console.log('Connected to socket server');
    showNotification('Connected to real-time data server', 'success');
    
    // Request initial market data
    socket.emit('get_market_data');
  });
  
  socket.on('disconnect', () => {
    console.log('Disconnected from socket server');
    showNotification('Connection lost. Trying to reconnect...', 'error');
  });
  
  socket.on('welcome', (data) => {
    console.log('Welcome message:', data.message);
    showNotification(data.message, 'info');
    document.getElementById('notificationContainer').innerHTML = 
      `<div class="alert alert-success">Connected to NIFTY Options Viewer</div>`;
    
    // Request initial market data
    socket.emit('get_market_data');
  });
  
  socket.on('market_update', (data) => {
    // Update market data
    marketData = data;
    updateMarketDisplay();
    document.getElementById('notificationContainer').innerHTML = '';
  });
  
  socket.on('options_data', (data) => {
    if (data && data.data) {
      optionsData = data.data;
      updateOptionsTable();
      document.getElementById('notificationContainer').innerHTML = '';
    }
  });
  
  socket.on('error', (error) => {
    console.error('Socket error:', error);
    showNotification('Connection error: ' + error.message, 'error');
  });
}

function setupDashboardUI() {
  // Set up logout button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
  
  // Set up expiry date selector
  const expirySelect = document.getElementById('expirySelect');
  if (expirySelect) {
    expirySelect.addEventListener('change', function() {
      currentExpiry = this.value;
      fetchOptionsData(currentExpiry);
    });
  }
  
  // Strike price filter
  const strikeFilter = document.getElementById('strikeFilter');
  if (strikeFilter) {
    strikeFilter.addEventListener('input', function() {
      filterOptionsByStrike(this.value);
    });
  }
  
  // Setup refresh button
  const refreshBtn = document.getElementById('refreshData');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function() {
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = '<i class="fas fa-sync-alt me-1 fa-spin"></i> Refreshing...';
      
      fetchMarketData();
      if (currentExpiry) {
        fetchOptionsData(currentExpiry);
      }
      showNotification('Refreshing data...', 'info');
      
      // Enable button after 2 seconds
      setTimeout(() => {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt me-1"></i> Refresh Data';
      }, 2000);
    });
  }
  
  // Setup PCR display toggle
  const pcrToggle = document.getElementById('showPCR');
  if (pcrToggle) {
    pcrToggle.addEventListener('change', function() {
      const pcrElements = document.querySelectorAll('.pcr-value');
      pcrElements.forEach(el => {
        el.style.display = this.checked ? 'table-cell' : 'none';
      });
    });
  }
}

function updateUserInfo() {
  const clientId = localStorage.getItem('clientId');
  
  // Update user name display with client ID for now
  const usernameElement = document.getElementById('username');
  if (usernameElement && clientId) {
    usernameElement.textContent = clientId;
  }

  // Try to fetch actual user info
  fetch('/api/dashboard')
    .then(response => response.json())
    .then(data => {
      if (data.status && data.data) {
        const { profile, funds } = data.data;
        
        // Update user name display
        if (usernameElement && profile && profile.name) {
          usernameElement.textContent = profile.name;
        }
        
        // Update funds display
        const fundsElement = document.getElementById('availableFunds');
        if (fundsElement && funds && funds.availablecash) {
          fundsElement.textContent = `₹${parseFloat(funds.availablecash).toLocaleString('en-IN')}`;
        }
      }
    })
    .catch(error => {
      console.error('Error fetching user info:', error);
    });
}

function fetchExpiryDates() {
  // In a real-world scenario, this would come from the API
  // For now, we'll generate some sample expiry dates
  
  const today = new Date();
  const expiryDates = [];
  
  // Find next few Thursdays (typical expiry day)
  for (let i = 0; i < 4; i++) {
    const date = new Date(today);
    // Find the next Thursday
    date.setDate(date.getDate() + ((4 + 7 - date.getDay()) % 7) + (i * 7));
    
    // Format date as YYYY-MM-DD
    const formattedDate = date.toISOString().split('T')[0];
    expiryDates.push(formattedDate);
  }
  
  populateExpiryDropdown(expiryDates);
  
  // Select the first expiry date
  if (expiryDates.length > 0) {
    currentExpiry = expiryDates[0];
    fetchOptionsData(currentExpiry);
  }
}

function populateExpiryDropdown(expiryDates) {
  const expirySelect = document.getElementById('expirySelect');
  if (!expirySelect) return;
  
  // Clear existing options
  expirySelect.innerHTML = '';
  
  // Add new options
  expiryDates.forEach(date => {
    const option = document.createElement('option');
    option.value = date;
    
    // Format the display date (e.g., "22 May 2025")
    const displayDate = new Date(date);
    option.textContent = displayDate.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    
    expirySelect.appendChild(option);
  });
}

function fetchMarketData() {
  document.getElementById('notificationContainer').innerHTML = 
    `<div class="alert alert-info">Fetching market data...</div>`;
  
  fetch('/api/market-data')
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.status && data.data) {
        marketData = data.data;
        updateMarketDisplay();
        document.getElementById('notificationContainer').innerHTML = '';
      } else {
        showNotification(`Failed to fetch market data: ${data.message || 'Unknown error'}`, 'error');
      }
    })
    .catch(error => {
      console.error('Error fetching market data:', error);
      showNotification(`Error fetching market data: ${error.message}`, 'error');
      
      // For demo purposes, provide sample data
      marketData = {
        niftySpot: 24944,
        niftyChange: -0.3,
        niftyFuture: null,
        pcrRatio: null,
        ivIndex: null
      };
      updateMarketDisplay();
    });
}

function fetchOptionsData(expiryDate) {
  showLoader('optionsTableContainer');
  document.getElementById('notificationContainer').innerHTML = 
    `<div class="alert alert-info">Fetching options data for ${expiryDate}...</div>`;
  
  fetch(`/api/options?expiry=${expiryDate}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      hideLoader('optionsTableContainer');
      
      if (data.status && data.data) {
        optionsData = data.data.data || [];
        updateOptionsTable();
        document.getElementById('notificationContainer').innerHTML = '';
      } else {
        document.getElementById('notificationContainer').innerHTML = 
          `<div class="alert alert-danger">Failed to fetch options data: ${data.message || 'Unknown error'}</div>`;
      }
    })
    .catch(error => {
      hideLoader('optionsTableContainer');
      console.error('Error fetching options data:', error);
      document.getElementById('notificationContainer').innerHTML = 
        `<div class="alert alert-danger">Error fetching options data: ${error.message}</div>`;
      
      // For demo purposes, generate sample options data
      generateSampleOptionsData();
    });
}

function generateSampleOptionsData() {
  const niftySpot = marketData.niftySpot || 24944;
  const atmStrike = Math.round(niftySpot / 50) * 50; // Round to nearest 50
  
  optionsData = [];
  
  // Generate data for strikes around ATM
  for (let i = -10; i <= 10; i++) {
    const strike = atmStrike + (i * 50);
    const distance = Math.abs(strike - niftySpot);
    
    // Calculate option values based on distance from spot
    const ceLtp = Math.max(10, Math.round((niftySpot - strike + 100) * (Math.random() * 0.3 + 0.8)));
    const peLtp = Math.max(10, Math.round((strike - niftySpot + 100) * (Math.random() * 0.3 + 0.8)));
    
    // OI values decrease as we move away from ATM
    const ceOi = Math.round(10000000 / (1 + distance/100)) * (1 + Math.random() * 0.4);
    const peOi = Math.round(9000000 / (1 + distance/100)) * (1 + Math.random() * 0.4);
    
    optionsData.push({
      strike,
      ce: {
        oi: Math.round(ceOi),
        volume: Math.round(ceOi * (0.1 + Math.random() * 0.2)),
        ltp: ceLtp,
        change: ((Math.random() * 10) - 5).toFixed(2)
      },
      pe: {
        oi: Math.round(peOi),
        volume: Math.round(peOi * (0.1 + Math.random() * 0.2)),
        ltp: peLtp,
        change: ((Math.random() * 10) - 5).toFixed(2)
      }
    });
  }
  
  updateOptionsTable();
}

function updateMarketDisplay() {
  // Update NIFTY spot price
  const spotPriceElement = document.getElementById('niftySpot');
  if (spotPriceElement && marketData.niftySpot) {
    spotPriceElement.textContent = marketData.niftySpot.toLocaleString('en-IN');
    
    // Update color based on change
    if (marketData.niftyChange > 0) {
      spotPriceElement.classList.remove('text-danger');
      spotPriceElement.classList.add('text-success');
    } else if (marketData.niftyChange < 0) {
      spotPriceElement.classList.remove('text-success');
      spotPriceElement.classList.add('text-danger');
    } else {
      spotPriceElement.classList.remove('text-success', 'text-danger');
    }
  }
  
  // Update NIFTY change
  const changeElement = document.getElementById('niftyChange');
  if (changeElement && marketData.niftyChange !== undefined) {
    const sign = marketData.niftyChange >= 0 ? '+' : '';
    changeElement.textContent = `${sign}${marketData.niftyChange}%`;
    
    // Update color based on change
    if (marketData.niftyChange > 0) {
      changeElement.classList.remove('text-danger', 'bg-danger');
      changeElement.classList.add('text-success', 'bg-success');
    } else if (marketData.niftyChange < 0) {
      changeElement.classList.remove('text-success', 'bg-success');
      changeElement.classList.add('text-danger', 'bg-danger');
    } else {
      changeElement.classList.remove('text-success', 'text-danger', 'bg-success', 'bg-danger');
    }
  }
  
  // Update NIFTY futures
  const futureElement = document.getElementById('niftyFuture');
  if (futureElement) {
    if (marketData.niftyFuture) {
      futureElement.textContent = marketData.niftyFuture.toLocaleString('en-IN');
    } else {
      futureElement.textContent = '--';
    }
  }
  
  // Update PCR ratio
  const pcrElement = document.getElementById('pcrRatio');
  if (pcrElement) {
    if (marketData.pcrRatio) {
      pcrElement.textContent = marketData.pcrRatio.toFixed(2);
    } else {
      pcrElement.textContent = '--';
    }
  }
  
  // Update IV Index
  const ivIndexElement = document.getElementById('ivIndex');
  if (ivIndexElement) {
    if (marketData.ivIndex) {
      ivIndexElement.textContent = marketData.ivIndex.toFixed(2) + '%';
    } else {
      ivIndexElement.textContent = '--';
    }
  }
}

function updateOptionsTable() {
  const tableBody = document.getElementById('optionsTableBody');
  if (!tableBody) return;
  
  // Clear table
  tableBody.innerHTML = '';
  
  if (!optionsData || optionsData.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="10" class="text-center py-4">No options data available. Please try again later.</td></tr>';
    return;
  }
  
  // Sort options by strike price
  const sortedOptions = [...optionsData].sort((a, b) => a.strike - b.strike);
  
  // Find ATM strike (closest to current spot price)
  const atmStrike = findATMStrike(sortedOptions, marketData.niftySpot || 0);
  
  // Create table rows
  sortedOptions.forEach(option => {
    const row = document.createElement('tr');
    
    // Highlight ATM strike
    if (option.strike === atmStrike) {
      row.classList.add('table-warning');
    }
    
    // Highlight selected strike
    if (option.strike === selectedStrike) {
      row.classList.add('table-primary');
    }
    
    // Add click event to select row
    row.addEventListener('click', function() {
      selectStrike(option.strike);
    });
    
    // CE data cells
    row.appendChild(createTableCell(option.ce?.oi ? formatNumber(option.ce.oi) : '-', 'text-end'));
    row.appendChild(createTableCell(option.ce?.volume ? formatNumber(option.ce.volume) : '-', 'text-end'));
    row.appendChild(createTableCell(option.ce?.ltp ? option.ce.ltp.toFixed(1) : '-', 'text-end'));
    
    // CE change cell
    const ceChangeCell = document.createElement('td');
    ceChangeCell.classList.add('text-end');
    if (option.ce?.change) {
      const changeValue = parseFloat(option.ce.change);
      ceChangeCell.textContent = (changeValue >= 0 ? '+' : '') + changeValue + '%';
      
      if (changeValue > 0) {
        ceChangeCell.classList.add('text-success');
      } else if (changeValue < 0) {
        ceChangeCell.classList.add('text-danger');
      }
    } else {
      ceChangeCell.textContent = '-';
    }
    row.appendChild(ceChangeCell);
    
    // Strike price cell
    const strikeCell = document.createElement('td');
    strikeCell.textContent = option.strike.toLocaleString('en-IN');
    strikeCell.classList.add('text-center', 'fw-bold', 'border-start', 'border-end');
    row.appendChild(strikeCell);
    
    // PE change cell
    const peChangeCell = document.createElement('td');
    peChangeCell.classList.add('text-end');
    if (option.pe?.change) {
      const changeValue = parseFloat(option.pe.change);
      peChangeCell.textContent = (changeValue >= 0 ? '+' : '') + changeValue + '%';
      
      if (changeValue > 0) {
        peChangeCell.classList.add('text-success');
      } else if (changeValue < 0) {
        peChangeCell.classList.add('text-danger');
      }
    } else {
      peChangeCell.textContent = '-';
    }
    row.appendChild(peChangeCell);
    
    // PE data cells
    row.appendChild(createTableCell(option.pe?.ltp ? option.pe.ltp.toFixed(1) : '-', 'text-end'));
    row.appendChild(createTableCell(option.pe?.volume ? formatNumber(option.pe.volume) : '-', 'text-end'));
    row.appendChild(createTableCell(option.pe?.oi ? formatNumber(option.pe.oi) : '-', 'text-end'));
    
    // PCR cell
    const pcrCell = document.createElement('td');
    pcrCell.classList.add('pcr-value', 'text-center');
    
    if (option.pe?.oi && option.ce?.oi && option.ce.oi > 0) {
      const pcr = option.pe.oi / option.ce.oi;
      pcrCell.textContent = pcr.toFixed(2);
      
      // Color code PCR values
      if (pcr > 1.5) {
        pcrCell.classList.add('text-danger');
      } else if (pcr < 0.5) {
        pcrCell.classList.add('text-success');
      }
    } else {
      pcrCell.textContent = '-';
    }
    
    // Check if PCR display is toggled on
    const pcrToggle = document.getElementById('showPCR');
    if (pcrToggle && !pcrToggle.checked) {
      pcrCell.style.display = 'none';
    }
    
    row.appendChild(pcrCell);
    
    // Add row to table
    tableBody.appendChild(row);
  });
}

function createTableCell(text, className) {
  const cell = document.createElement('td');
  cell.textContent = text;
  if (className) {
    cell.classList.add(...className.split(' '));
  }
  return cell;
}

function findATMStrike(options, spotPrice) {
  if (!options || options.length === 0 || !spotPrice) return null;
  
  // Find the strike price closest to the spot price
  return options.reduce((closest, option) => {
    return Math.abs(option.strike - spotPrice) < Math.abs(closest - spotPrice) ? option.strike : closest;
  }, options[0].strike);
}

function selectStrike(strike) {
  selectedStrike = strike;
  
  // Update selected strike display
  const selectedStrikeElement = document.getElementById('selectedStrike');
  if (selectedStrikeElement) {
    selectedStrikeElement.textContent = strike.toLocaleString('en-IN');
  }
  
  // Remove selection from all rows
  const rows = document.querySelectorAll('#optionsTableBody tr');
  rows.forEach(row => row.classList.remove('table-primary'));
  
  // Find and highlight the selected row
  rows.forEach(row => {
    const strikeCell = row.querySelector('td:nth-child(5)');
    if (strikeCell && parseFloat(strikeCell.textContent.replace(/,/g, '')) === strike) {
      row.classList.add('table-primary');
    }
  });
  
  // Find option data for the selected strike
  const option = optionsData.find(opt => opt.strike === strike);
  if (option) {
    updateSelectedOptionDetails(option);
  }
}

function updateSelectedOptionDetails(option) {
  // Update CE details
  document.getElementById('ceLTP').textContent = option.ce?.ltp ? option.ce.ltp.toFixed(1) : '-';
  document.getElementById('ceOI').textContent = option.ce?.oi ? formatNumber(option.ce.oi) : '-';
  document.getElementById('ceVolume').textContent = option.ce?.volume ? formatNumber(option.ce.volume) : '-';
  
  // Update PE details
  document.getElementById('peLTP').textContent = option.pe?.ltp ? option.pe.ltp.toFixed(1) : '-';
  document.getElementById('peOI').textContent = option.pe?.oi ? formatNumber(option.pe.oi) : '-';
  document.getElementById('peVolume').textContent = option.pe?.volume ? formatNumber(option.pe.volume) : '-';
  
  // Calculate and update straddle price
  const straddlePrice = (option.ce?.ltp || 0) + (option.pe?.ltp || 0);
  document.getElementById('straddlePrice').textContent = straddlePrice.toFixed(1);
  
  // Calculate buying power
  const lotSize = parseInt(document.getElementById('lotSize').textContent) || 75;
  const buyingPower = straddlePrice * lotSize;
  document.getElementById('buyingPower').textContent = `₹${buyingPower.toLocaleString('en-IN')}`;
}

function filterOptionsByStrike(filterValue) {
  if (!filterValue) {
    // Show all rows if filter is empty
    const rows = document.querySelectorAll('#optionsTableBody tr');
    rows.forEach(row => row.style.display = '');
    return;
  }
  
  // Convert to number for comparison
  const filter = parseInt(filterValue.replace(/,/g, ''), 10);
  if (isNaN(filter)) return;
  
  // Hide rows that don't contain the filter value
  const rows = document.querySelectorAll('#optionsTableBody tr');
  rows.forEach(row => {
    const strikeCell = row.querySelector('td:nth-child(5)');
    if (strikeCell) {
      const strikeValue = parseInt(strikeCell.textContent.replace(/,/g, ''), 10);
      if (strikeValue.toString().includes(filter.toString())) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    }
  });
}

// ===== Utility Functions =====

function formatNumber(num) {
  if (!num) return '-';
  
  if (num >= 10000000) {
    return (num / 10000000).toFixed(2) + ' Cr';
  } else if (num >= 100000) {
    return (num / 100000).toFixed(2) + ' L';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + ' K';
  } else {
    return num.toString();
  }
}

function showNotification(message, type = 'info') {
  const notificationContainer = document.getElementById('notificationContainer');
  if (!notificationContainer) return;
  
  const notification = document.createElement('div');
  notification.classList.add('alert', `alert-${type}`, 'notification');
  notification.textContent = message;
  
  notificationContainer.appendChild(notification);
  
  // Auto-remove after 5 seconds
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => {
      notification.remove();
    }, 500);
  }, 5000);
}

function showLoader(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  // Create loader if it doesn't exist
  let loader = container.querySelector('.loader');
  if (!loader) {
    loader = document.createElement('div');
    loader.classList.add('loader');
    loader.innerHTML = '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>';
    container.appendChild(loader);
  }
  
  loader.style.display = 'flex';
}

function hideLoader(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const loader = container.querySelector('.loader');
  if (loader) {
    loader.style.display = 'none';
  }
}

// Export functions that might be used in other scripts
window.logout = logout;
window.selectStrike = selectStrike;
window.fetchOptionsData = fetchOptionsData;
window.fetchMarketData = fetchMarketData;