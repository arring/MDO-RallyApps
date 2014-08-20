(function () {
    var Ext = window.Ext4 || window.Ext;

    Ext.define("Rally.apps.charts.settings.SettingsChangeMixin", {

        sendSettingsChange: function(artifact) {
            if (this.settingsParent) {
                this.settingsParent.sendSettingsChange(artifact, this);
            }
        },

        receiveSettingsChange: function(artifact) {

        }

    });
}());
