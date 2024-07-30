/**
 * @fileoverview HumHub Firebase Module
 * This module handles Firebase Cloud Messaging (FCM) integration for HumHub.
 * It manages notification permissions, token handling, and message reception.
 * @module firebase
 */

humhub.module('firebase', function (module, require, $) {
    let messaging;

    /**
     * Initializes the Firebase module.
     * Sets up the Firebase app if not already initialized and configures message handling.
     */
    const init = function () {
        if (!firebase.apps.length) {
            firebase.initializeApp({messagingSenderId: this.senderId()});
            this.messaging = firebase.messaging();

            this.messaging.onMessage(function (payload) {
                module.log.info("Received FCM Push Notification", payload);
            });

            // Callback fired if Instance ID token is updated.
            this.messaging.onTokenRefresh(function () {
                this.messaging.getToken().then(function (refreshedToken) {
                    this.deleteTokenLocalStore();
                    this.sendTokenToServer(refreshedToken);
                }).catch(function (err) {
                    console.log('Unable to retrieve refreshed token ', err);
                });
            });
        }
    };

    /**
     * Generates the appropriate content for notification permission status.
     * @returns {string} HTML content describing the current notification permission status.
     */
    const getNotificationPermissionContent = function () {
        if (!("Notification" in window)) {
            return 'Not Supported: This browser does not support notifications.';
        }
        console.log('Notification.permission:', Notification.permission);
        switch (Notification.permission) {
            case "granted":
                return 'Granted: Push Notifications are active on this browser.<br>You can disable it in browser settings for this site.';
            case "denied":
                return 'Denied: You have blocked Push Notifications.<br>You can enable it in browser settings for this site.';
            default:
                return 'Default: Push Notifications are not yet enabled.<br><a href="#" id="enablePushBtn"><i class="fa fa-unlock"></i> Click here to enable</a>';
        }
    }

    /**
     * Displays the notification permission request window.
     * Handles the permission request process and updates the UI accordingly.
     */
    const showNotificationPermissionWindow = function () {
        function handlePermission(permission) {
            addPushNotificationPermissionsInfo(permission, true);
        }

        if (!("Notification" in window)) {
            console.log("This browser does not support notifications.");
            handlePermission("not-supported");
        } else {
            Notification.requestPermission().then((permission) => {
                handlePermission(permission);
            });
        }
    }

    /**
     * Adds or updates the push notification permissions information in the UI.
     * @param {string} permission - The current notification permission status.
     * @param {boolean} rewrite - Whether to rewrite existing content or add new content.
     */
    const addPushNotificationPermissionsInfo = function (permission, rewrite = false) {
        if (rewrite) {
            const contentContainer = document.getElementById('notificationPermissions');
            contentContainer.innerHTML = getNotificationPermissionContent()
        } else {
            const content = '<div class="panel panel-default panel-pn-permissions"><div class="panel-body" id="notificationPermissions">' + getNotificationPermissionContent() + '</div></div>';
            $('.layout-sidebar-container').prepend($(content));
        }

        $('#enablePushBtn').on('click', showNotificationPermissionWindow);
    }

    /**
     * Handles tasks after service worker registration.
     * Requests notification permission and manages token retrieval and storage.
     * @param {ServiceWorkerRegistration} registration - The service worker registration object.
     */
    const afterServiceWorkerRegistration = function (registration) {
        const that = this;

        this.messaging.useServiceWorker(registration);

        this.messaging.requestPermission().then(function () {
            addPushNotificationPermissionsInfo('granted');

            that.messaging.getToken().then(function (currentToken) {
                if (currentToken) {
                    that.sendTokenToServer(currentToken);
                } else {
                    module.log.info('No Instance ID token available. Request permission to generate one.');
                    that.deleteTokenLocalStore();
                }
            }).catch(function (err) {
                module.log.error('An error occurred while retrieving token. ', err);
                that.deleteTokenLocalStore();
            });
        }).catch(function (err) {
            module.log.info('Could not get Push Notification permission!', err);
            addPushNotificationPermissionsInfo(Notification.permission);
        });
    };

    /**
     * Sends the FCM token to the server.
     * @param {string} token - The FCM token to be sent.
     */
    const sendTokenToServer = function (token) {
        const that = this;
        if (!that.isTokenSentToServer(token)) {
            module.log.info("Send FCM Push Token to Server");
            $.ajax({
                method: "POST",
                url: that.tokenUpdateUrl(),
                data: {token: token},
                success: function (data) {
                    that.setTokenLocalStore(token);
                }
            });
        } else {
            //console.log('Token already sent to server so won\'t send it again unless it changes');
        }
    };

    /**
     * Checks if the token has been sent to the server.
     * @param {string} token - The token to check.
     * @returns {boolean} True if the token has been sent to the server, false otherwise.
     */
    const isTokenSentToServer = function (token) {
        return (this.getTokenLocalStore() === token);
    };

    /**
     * Deletes the token from local storage.
     */
    const deleteTokenLocalStore = function () {
        window.localStorage.removeItem('fcmPushToken_' + this.senderId())
    };

    /**
     * Stores the token in local storage with an expiry time.
     * @param {string} token - The token to store.
     */
    const setTokenLocalStore = function (token) {
        const item = {
            value: token,
            expiry: (Date.now() / 1000) + (24 * 60 * 60),
        };
        window.localStorage.setItem('fcmPushToken_' + this.senderId(), JSON.stringify(item))
    };

    /**
     * Retrieves the token from local storage.
     * @returns {string|null} The stored token if valid, null otherwise.
     */
    const getTokenLocalStore = function () {
        const itemStr = window.localStorage.getItem('fcmPushToken_' + this.senderId())

        // if the item doesn't exist, return null
        if (!itemStr) {
            return null
        }
        const item = JSON.parse(itemStr)
        const now = (Date.now() / 1000)
        if (now > item.expiry) {
            this.deleteTokenLocalStore();
            return null;
        }
        return item.value;
    };

    /**
     * Returns the URL for updating the token on the server.
     * @returns {string} The token update URL.
     */
    const tokenUpdateUrl = function () {
        return module.config.tokenUpdateUrl;
    };

    /**
     * Returns the sender ID for FCM.
     * @returns {string} The sender ID.
     */
    const senderId = function () {
        return module.config.senderId;
    };

    module.export({
        init: init,
        isTokenSentToServer: isTokenSentToServer,
        sendTokenToServer: sendTokenToServer,
        afterServiceWorkerRegistration: afterServiceWorkerRegistration,
        senderId: senderId,
        tokenUpdateUrl: tokenUpdateUrl,
        setTokenLocalStore: setTokenLocalStore,
        getTokenLocalStore: getTokenLocalStore,
        deleteTokenLocalStore: deleteTokenLocalStore,
    });
});

/**
 * Global function to handle service worker registration for the Firebase module.
 * @param {ServiceWorkerRegistration} registration - The service worker registration object.
 */
function afterServiceWorkerRegistration(registration) {
    humhub.modules.firebase.afterServiceWorkerRegistration(registration);
}
