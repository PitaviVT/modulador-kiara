import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, Platform,LogBox } from 'react-native';
import * as tf from '@tensorflow/tfjs';

// Esto elimina específicamente ese mensaje de la consola
LogBox.ignoreLogs(['props.pointerEvents is deprecated']);;

export default function KiaraScreen() {
  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState<tf.Sequential | null>(null);
  const [prediction, setPrediction] = useState<string | null>(null);

  useEffect(() => {
    async function initTensorFlow() {
      try {
        await tf.ready();
        
        // Creamos el modelo
        const _model = tf.sequential();
        _model.add(tf.layers.dense({ units: 1, inputShape: [1] }));
        _model.compile({ loss: 'meanSquaredError', optimizer: 'sgd' });

        // Datos: y = 2x - 1
        const xs = tf.tensor2d([1, 2, 3, 4], [4, 1]);
        const ys = tf.tensor2d([1, 3, 5, 7], [4, 1]);

        await _model.fit(xs, ys, { epochs: 50 });

        setModel(_model);
        setLoading(false);
      } catch (e) {
        console.error("TF Init Error:", e);
      }
    }
    initTensorFlow();
  }, []);

  const handlePredict = () => {
    if (model) {
      const output = model.predict(tf.tensor2d([5], [1, 1])) as tf.Tensor;
      setPrediction(output.dataSync()[0].toFixed(2));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>IA Kiara {Platform.OS.toUpperCase()}</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#2196F3" />
      ) : (
        <View style={styles.card}>
          <TouchableOpacity style={styles.button} onPress={handlePredict}>
            <Text style={styles.buttonText}>Predecir x=5</Text>
          </TouchableOpacity>
          {prediction && <Text style={styles.result}>Resultado: {prediction}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  card: { padding: 20, backgroundColor: 'white', borderRadius: 10, width: '80%', alignItems: 'center', elevation: 3 },
  button: { backgroundColor: '#2196F3', padding: 15, borderRadius: 8, width: '100%' },
  buttonText: { color: 'white', textAlign: 'center', fontWeight: 'bold' },
  result: { fontSize: 24, marginTop: 20, color: '#4CAF50', fontWeight: 'bold' }
});