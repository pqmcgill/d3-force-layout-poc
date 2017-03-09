import Ember from 'ember';

export default Ember.Controller.extend({
    data: function() {
        return this.get('model');
    }.property('model'),

    actions: {
        clickOption1: function(node) {
            console.log('you\'ve clicked option1 for node:', node);
        },

        clickOption2: function(node) {
            console.log('you\'ve clicked option2 for node:', node);
        },

        clickOption3: function(node) {
            console.log('you\'ve clicked option3 for node:', node);
        },

        clickOption4: function(node) {
            console.log('you\'ve clicked option4 for node:', node);
        }
    }
});
