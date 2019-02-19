<template>
  <div>
    <span>{{ 'hello' | tr }}</span>
    <span :title="'goodbye' | tr">{{ ', World' }}</span>
    <span :data-title="'ta ta for now' | tr">!</span>
    <span :camelCaseAttribute="'well hello again, __name__!' | tr({ name: 'earth' })">!</span>
    <span>{{ 'hey' | tr }}</span>
  </div>
</template>

<script>
  export default {
    computed: {
      translate() {
        return {
          'one': tr('un'),
          'two': tr('deux'),
          'three': tr('trois'),
          'count': tr('one, __two__, three', { two: '2' })
        };
      }
    }
  }
</script>
