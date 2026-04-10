import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
// Importamos la librería base que funciona en todas las plataformas
import * as tf from '@tensorflow/tfjs';

export default function KiaraScreen() {
  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState<tf.Sequential | null>(null);
  const [prediction, setPrediction] = useState<string | null>(null);

  useEffect(() => {
    async function initTensorFlow() {
      // 1. Esperamos a que el motor básico esté listo
      await tf.ready();
      
      // En móvil, forzamos el backend de CPU para evitar que busque drivers nativos inexistentes
      if (Platform.OS !== 'web') {
        await tf.setBackend('cpu');
      }

      // 2. Definición del modelo (Lógica universal)
      const _model = tf.sequential();
      _model.add(tf.layers.dense({ units: 1, inputShape: [1] }));
      _model.compile({ loss: 'meanSquaredError', optimizer: 'sgd' });

      // 3. Datos de entrenamiento
      const xs = tf.tensor2d([1, 2, 3, 4], [4, 1]);
      const ys = tf.tensor2d([1, 3, 5, 7], [4, 1]);

      // 4. Entrenamiento
      await _model.fit(xs, ys, { epochs: 50 });

      setModel(_model);
      setLoading(false);
    }

    initTensorFlow();
  }, []);

  const handlePredict = () => {
    if (model) {
      // Usamos tf directamente ya que está importado arriba
      const output = model.predict(tf.tensor2d([5], [1, 1])) as tf.Tensor;
      const resultValue = output.dataSync()[0];
      setPrediction(resultValue.toFixed(2));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>IA Universal (Web & Móvil)</Text>
      
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Entrenando neurona...</Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.text}>
            {Platform.OS === 'web' 
              ? 'Ejecutando en Navegador' 
              : 'Ejecutando en Móvil (Modo CPU)'}
          </Text>
          
          <TouchableOpacity style={styles.button} onPress={handlePredict}>
            <Text style={styles.buttonText}>Predecir para x = 5</Text>
          </TouchableOpacity>

          {prediction && (
            <View style={styles.resultContainer}>
              <Text style={styles.resultLabel}>Resultado (IA):</Text>
              <Text style={styles.resultValue}>{prediction}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  center: { alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#333' },
  card: { padding: 25, backgroundColor: 'white', borderRadius: 15, width: '85%', elevation: 5 },
  text: { marginBottom: 20, textAlign: 'center', fontSize: 16, color: '#666' },
  loadingText: { marginTop: 10, color: '#2196F3', fontWeight: '500' },
  button: { backgroundColor: '#4CAF50', padding: 15, borderRadius: 10 },
  buttonText: { color: 'white', fontWeight: 'bold', textAlign: 'center' },
  resultContainer: { marginTop: 20, alignItems: 'center' },
  resultLabel: { fontSize: 14, color: '#888' },
  resultValue: { fontSize: 32, color: '#4CAF50', fontWeight: 'bold' }
});